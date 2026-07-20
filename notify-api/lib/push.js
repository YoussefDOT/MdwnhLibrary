/**
 * Shared push plumbing for both endpoints.
 *
 * api/notify.js  — instant, one task, called by نواف's browser on creation
 * api/sweep.js   — scheduled, all tasks, called by an external cron
 *
 * The wording lives here once so the instant and scheduled notifications can
 * never drift apart. (tools/send-reminders.mjs is the legacy GitHub Actions
 * path and carries its own copy; it is only used if that cron ever works.)
 */

import webpush from 'web-push';

export const DB = (process.env.DB_URL || 'https://mdwnhpoints-default-rtdb.europe-west1.firebasedatabase.app').replace(/\/$/, '');
export const SITE = (process.env.SITE_URL || 'https://youssefdot.github.io/MdwnhLibrary').replace(/\/$/, '');
export const ROOT = 'mdwnhLibrary';
export const DAY = 24 * 60 * 60 * 1000;

export function configureVapid() {
  const PUB = process.env.VAPID_PUBLIC;
  const PRIV = process.env.VAPID_PRIVATE;
  const SUBJ = process.env.VAPID_SUBJECT || 'mailto:noreply@example.com';
  if (!PUB || !PRIV) return null;
  webpush.setVapidDetails(SUBJ, PUB, PRIV);
  return { PUB, PRIV, SUBJ };
}

export async function get(path) {
  const r = await fetch(`${DB}/${path}.json`);
  if (!r.ok) throw new Error(`GET ${path} -> ${r.status}`);
  return r.json();
}
export async function put(path, value) {
  const r = await fetch(`${DB}/${path}.json`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(value)
  });
  if (!r.ok) throw new Error(`PUT ${path} -> ${r.status}`);
}
export async function del(path) {
  await fetch(`${DB}/${path}.json`, { method: 'DELETE' });
}

export function arabicDue(ms) {
  return new Date(ms).toLocaleString('ar-EG', {
    timeZone: 'Africa/Cairo',
    day: 'numeric', month: 'long',
    hour: '2-digit', minute: '2-digit'
  });
}

export async function loadRoster() {
  try {
    const r = await fetch(`${SITE}/members.json`);
    const j = await r.json();
    const nameOf = {};
    for (const m of j.members || []) nameOf[m.slug] = m.name;
    return nameOf;
  } catch { return {}; }
}

export function newTaskPayload(task, taskId, slug, who) {
  return {
    title: `يا ${who}! لديك مهمة جديدة`,
    body: `${task.emoji || '📌'} ${task.title} — ${arabicDue(task.due)}`,
    icon: `${SITE}/MdwnhMembers/${slug}.png`,
    url: `${SITE}/`,
    tag: `task-new-${taskId}`
  };
}

export function day1Payload(task, taskId, slug, who) {
  return {
    title: `يا ${who}! بقي يوم واحد ⏳`,
    body: `${task.emoji || '📌'} ${task.title} — ${arabicDue(task.due)}`,
    icon: `${SITE}/MdwnhMembers/${slug}.png`,
    url: `${SITE}/`,
    tag: `task-day1-${taskId}`,
    urgent: true
  };
}

/**
 * Deliver one payload to every device a member has registered.
 * Returns { sent, attempted, errors }.
 *
 * 404/410 = the push service dropped the subscription.
 * 403     = bound to a VAPID key we no longer hold.
 * Both are permanently dead, so both get deleted; the device re-registers on
 * its next app open. Anything else is reported rather than swallowed.
 */
export async function pushToMember(slug, subs, payload) {
  let sent = 0, attempted = 0;
  const errors = [];
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
      if (code === 404 || code === 410 || code === 403) {
        await del(`${ROOT}/users/${slug}/push/${subId}`);
        errors.push({
          slug, subId, code,
          note: code === 403 ? 'stale VAPID binding, removed' : 'expired, removed'
        });
      } else {
        errors.push({
          slug, subId, code: code || null,
          body: String(err.body || err.message || '').slice(0, 200)
        });
      }
    }
  }
  return { sent, attempted, errors };
}
