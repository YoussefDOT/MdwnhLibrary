/**
 * send-reminders.mjs
 * ------------------
 * Runs on a GitHub Actions cron. Reads the task list out of Firebase RTDB and
 * pushes two kinds of reminder:
 *
 *   1. "new task"  — the first time a task is seen (notified.created is falsy)
 *   2. "1 day left" — once, when the deadline is under 24h away (notified.day1)
 *
 * Members who already ticked the task off are skipped. Subscriptions the push
 * service reports as gone (404/410) are deleted so the list stays clean.
 *
 * Env:
 *   VAPID_PUBLIC   VAPID public key  (same value as VAPID_PUBLIC_KEY in library.js)
 *   VAPID_PRIVATE  VAPID private key (secret — never put this in the website)
 *   VAPID_SUBJECT  mailto: address, e.g. mailto:you@example.com
 *   DB_URL         RTDB base URL (optional, defaults below)
 *   SITE_URL       public site URL (optional, used for avatar images + click target)
 */

import webpush from 'web-push';

const DB = (process.env.DB_URL || 'https://mdwnhpoints-default-rtdb.europe-west1.firebasedatabase.app').replace(/\/$/, '');
const SITE = (process.env.SITE_URL || 'https://youssefdot.github.io/MdwnhLibrary').replace(/\/$/, '');
const ROOT = 'mdwnhLibrary';

const PUB = process.env.VAPID_PUBLIC;
const PRIV = process.env.VAPID_PRIVATE;
const SUBJ = process.env.VAPID_SUBJECT || 'mailto:noreply@example.com';

if (!PUB || !PRIV) {
  console.error('Missing VAPID_PUBLIC / VAPID_PRIVATE. Set them as GitHub repository secrets.');
  process.exit(1);
}
webpush.setVapidDetails(SUBJ, PUB, PRIV);

const DAY = 24 * 60 * 60 * 1000;

/* ---------- tiny RTDB REST helpers ---------- */
async function get(path) {
  const r = await fetch(`${DB}/${path}.json`);
  if (!r.ok) throw new Error(`GET ${path} -> ${r.status}`);
  return r.json();
}
async function put(path, value) {
  const r = await fetch(`${DB}/${path}.json`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(value)
  });
  if (!r.ok) throw new Error(`PUT ${path} -> ${r.status}`);
}
async function del(path) {
  await fetch(`${DB}/${path}.json`, { method: 'DELETE' });
}

/* ---------- formatting ---------- */
function arabicDue(ms) {
  return new Date(ms).toLocaleString('ar-EG', {
    timeZone: 'Africa/Cairo',
    day: 'numeric', month: 'long',
    hour: '2-digit', minute: '2-digit'
  });
}

/* ---------- delivery ---------- */
async function pushTo(slug, subs, payload) {
  let sent = 0;
  let attempted = 0;
  for (const [subId, s] of Object.entries(subs || {})) {
    if (!s || !s.endpoint) continue;
    attempted++;
    try {
      await webpush.sendNotification(
        { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
        JSON.stringify(payload)
      );
      sent++;
    } catch (err) {
      const code = err.statusCode;
      if (code === 404 || code === 410) {
        console.log(`  · dropping dead subscription ${slug}/${subId}`);
        await del(`${ROOT}/users/${slug}/push/${subId}`);
      } else if (code === 403) {
        // Bound to a VAPID key we no longer hold — unusable forever. Drop it so
        // the device re-registers with the current key on its next app open.
        console.error(`  ✗ 403 for ${slug}/${subId} — stale VAPID binding, removing`);
        await del(`${ROOT}/users/${slug}/push/${subId}`);
      } else {
        console.warn(`  · push failed for ${slug}/${subId}: ${code || err.message}`);
      }
    }
  }
  return { sent, attempted };
}

/* ---------- main ---------- */
async function main() {
  const [tasks, users, roster] = await Promise.all([
    get(`${ROOT}/tasks`),
    get(`${ROOT}/users`),
    fetch(`${SITE}/members.json`).then((r) => r.json()).catch(() => null)
  ]);

  if (!tasks) { console.log('No tasks. Nothing to do.'); return; }

  const nameOf = {};
  if (roster && roster.members) for (const m of roster.members) nameOf[m.slug] = m.name;

  const now = Date.now();
  let totalSent = 0;

  for (const [id, t] of Object.entries(tasks)) {
    if (!t || !t.assignees) continue;

    const notified = t.notified || {};
    const assignees = Object.keys(t.assignees);
    const pending = assignees.filter((s) => !(t.done && t.done[s]));
    const msLeft = (t.due || 0) - now;

    /* --- 1. brand new task --- */
    if (!notified.created) {
      console.log(`New task "${t.title}" -> ${assignees.length} member(s)`);
      let sent = 0, attempted = 0;
      for (const slug of assignees) {
        const who = nameOf[slug] || slug;
        const r = await pushTo(slug, users?.[slug]?.push, {
          title: `يا ${who}! لديك مهمة جديدة`,
          body: `${t.emoji || '📌'} ${t.title} — ${arabicDue(t.due)}`,
          icon: `${SITE}/MdwnhMembers/${slug}.png`,
          url: `${SITE}/`,
          tag: `task-new-${id}`
        });
        sent += r.sent; attempted += r.attempted;
      }
      totalSent += sent;
      // Don't claim delivery we didn't achieve -- leave it unflagged so the
      // next sweep retries once whatever broke is fixed.
      if (sent > 0 || attempted === 0) {
        await put(`${ROOT}/tasks/${id}/notified/created`, true);
      } else {
        console.error(`  ✗ nothing delivered for "${t.title}" — leaving unflagged for retry`);
      }
    }

    /* --- 2. one day out --- */
    if (!notified.day1 && msLeft > 0 && msLeft <= DAY) {
      if (pending.length) {
        console.log(`1-day warning "${t.title}" -> ${pending.length} member(s)`);
        for (const slug of pending) {
          const who = nameOf[slug] || slug;
          const r = await pushTo(slug, users?.[slug]?.push, {
            title: `يا ${who}! بقي يوم واحد ⏳`,
            body: `${t.emoji || '📌'} ${t.title} — ${arabicDue(t.due)}`,
            icon: `${SITE}/MdwnhMembers/${slug}.png`,
            url: `${SITE}/`,
            tag: `task-day1-${id}`,
            urgent: true
          });
          totalSent += r.sent;
        }
      }
      // day1 is time-boxed: retrying past the deadline is pointless, so flag
      // it regardless and let the countdown speak for itself.
      await put(`${ROOT}/tasks/${id}/notified/day1`, true);
    }
  }

  console.log(`Done. ${totalSent} notification(s) delivered.`);
}

main().catch((e) => { console.error(e); process.exit(1); });
