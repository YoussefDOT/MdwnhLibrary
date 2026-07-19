/**
 * POST /api/notify   body: { "taskId": "-OxuXgZRHfemVOoEFK-Q" }
 *
 * Fires the "new task" push the instant نواف creates a task, instead of
 * waiting for the GitHub Actions sweep to notice it minutes later.
 *
 * SECURITY — why this needs no client secret:
 * The body carries a task id and nothing else. Title, recipients and wording
 * are all read from Firebase server-side, so a caller cannot choose who gets
 * notified or what it says. It is also idempotent: once notified.created is
 * true the endpoint no-ops. So the worst a stranger can do with the public
 * URL is re-trigger a notification that was already going out, once.
 *
 * NOTE: the payload shape here is intentionally identical to
 * tools/send-reminders.mjs. Change the wording in one, change it in the other.
 */

import webpush from 'web-push';

const DB = (process.env.DB_URL || 'https://mdwnhpoints-default-rtdb.europe-west1.firebasedatabase.app').replace(/\/$/, '');
const SITE = (process.env.SITE_URL || 'https://youssefdot.github.io/MdwnhLibrary').replace(/\/$/, '');
const ROOT = 'mdwnhLibrary';

const ALLOWED_ORIGINS = [
  'https://youssefdot.github.io',
  'http://localhost:4599',
  'http://127.0.0.1:4599'
];

function cors(req, res) {
  const origin = req.headers.origin;
  if (origin && ALLOWED_ORIGINS.includes(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
  }
  res.setHeader('Vary', 'Origin');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Access-Control-Max-Age', '86400');
}

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

function arabicDue(ms) {
  return new Date(ms).toLocaleString('ar-EG', {
    timeZone: 'Africa/Cairo',
    day: 'numeric', month: 'long',
    hour: '2-digit', minute: '2-digit'
  });
}

export default async function handler(req, res) {
  cors(req, res);
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });

  const PUB = process.env.VAPID_PUBLIC;
  const PRIV = process.env.VAPID_PRIVATE;
  const SUBJ = process.env.VAPID_SUBJECT || 'mailto:noreply@example.com';
  if (!PUB || !PRIV) {
    return res.status(500).json({ error: 'VAPID keys not configured on the server' });
  }
  webpush.setVapidDetails(SUBJ, PUB, PRIV);

  let body = req.body;
  if (typeof body === 'string') { try { body = JSON.parse(body); } catch { body = {}; } }
  const taskId = body && body.taskId;
  if (!taskId || typeof taskId !== 'string' || !/^[A-Za-z0-9_-]{1,64}$/.test(taskId)) {
    return res.status(400).json({ error: 'bad taskId' });
  }

  try {
    const task = await get(`${ROOT}/tasks/${taskId}`);
    if (!task) return res.status(404).json({ error: 'no such task' });

    // idempotent: the GitHub sweep may have beaten us to it
    if (task.notified && task.notified.created) {
      return res.status(200).json({ skipped: 'already notified' });
    }

    const assignees = Object.keys(task.assignees || {});
    if (!assignees.length) {
      await put(`${ROOT}/tasks/${taskId}/notified/created`, true);
      return res.status(200).json({ sent: 0, note: 'no assignees' });
    }

    const [users, roster] = await Promise.all([
      get(`${ROOT}/users`),
      fetch(`${SITE}/members.json`).then((r) => r.json()).catch(() => null)
    ]);

    const nameOf = {};
    if (roster && roster.members) for (const m of roster.members) nameOf[m.slug] = m.name;

    let sent = 0;
    for (const slug of assignees) {
      const subs = (users && users[slug] && users[slug].push) || {};
      const payload = JSON.stringify({
        title: `يا ${nameOf[slug] || slug}! لديك مهمة جديدة`,
        body: `${task.emoji || '📌'} ${task.title} — ${arabicDue(task.due)}`,
        image: `${SITE}/MdwnhMembers/${slug}.png`,
        icon: `${SITE}/assets/icon-192.png`,
        url: `${SITE}/`,
        tag: `task-new-${taskId}`
      });

      for (const [subId, s] of Object.entries(subs)) {
        if (!s || !s.endpoint) continue;
        try {
          await webpush.sendNotification(
            { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
            payload
          );
          sent++;
        } catch (err) {
          if (err.statusCode === 404 || err.statusCode === 410) {
            await del(`${ROOT}/users/${slug}/push/${subId}`);
          }
        }
      }
    }

    // Only flag after delivery, so a crash mid-send leaves the sweep to retry.
    await put(`${ROOT}/tasks/${taskId}/notified/created`, true);
    return res.status(200).json({ sent, assignees: assignees.length });
  } catch (e) {
    return res.status(500).json({ error: String(e.message || e) });
  }
}
