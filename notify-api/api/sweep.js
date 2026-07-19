/**
 * GET|POST /api/sweep
 *
 * The scheduled half of the reminder system. Walks every task and sends:
 *   1. "new task"   — anything the instant ping missed (offline, tab closed…)
 *   2. "1 day left" — once, when the deadline enters the last 24h
 *
 * GitHub Actions never once fired this repo's cron despite valid YAML on the
 * default branch of a public repo, so the schedule now comes from outside.
 * Point any free pinger (cron-job.org, UptimeRobot, Vercel Cron) at this URL.
 *
 * Safe to call as often as you like: the notified.created / notified.day1
 * flags make it idempotent, and members who already ticked a task off are
 * skipped. Set CRON_SECRET to require ?key=… if you want it locked down.
 */

import {
  ROOT, DAY, configureVapid, get, put, loadRoster,
  newTaskPayload, day1Payload, pushToMember
} from '../lib/push.js';

export default async function handler(req, res) {
  const keys = configureVapid();
  if (!keys) return res.status(500).json({ error: 'VAPID keys not configured' });

  const secret = process.env.CRON_SECRET;
  if (secret) {
    // Vercel Cron sends "Authorization: Bearer <CRON_SECRET>"; external pingers
    // are easier to configure with a query param or a custom header.
    const auth = req.headers.authorization || '';
    const given = (req.query && req.query.key) ||
      req.headers['x-cron-key'] ||
      (auth.startsWith('Bearer ') ? auth.slice(7) : null);
    if (given !== secret) return res.status(401).json({ error: 'bad key' });
  }

  try {
    const [tasks, users, nameOf] = await Promise.all([
      get(`${ROOT}/tasks`), get(`${ROOT}/users`), loadRoster()
    ]);
    if (!tasks) return res.status(200).json({ ok: true, note: 'no tasks' });

    const now = Date.now();
    let created = 0, day1 = 0;
    const errors = [];

    for (const [id, t] of Object.entries(tasks)) {
      if (!t || !t.assignees) continue;
      const notified = t.notified || {};
      const assignees = Object.keys(t.assignees);
      const pending = assignees.filter((s) => !(t.done && t.done[s]));
      const msLeft = (t.due || 0) - now;

      /* --- missed "new task" --- */
      if (!notified.created) {
        let sent = 0, attempted = 0;
        for (const slug of assignees) {
          const r = await pushToMember(
            slug, users?.[slug]?.push,
            newTaskPayload(t, id, slug, nameOf[slug] || slug)
          );
          sent += r.sent; attempted += r.attempted; errors.push(...r.errors);
        }
        created += sent;
        // Never claim delivery we did not achieve — leave it for the next pass.
        if (sent > 0 || attempted === 0) {
          await put(`${ROOT}/tasks/${id}/notified/created`, true);
        }
      }

      /* --- one day out --- */
      if (!notified.day1 && msLeft > 0 && msLeft <= DAY) {
        for (const slug of pending) {
          const r = await pushToMember(
            slug, users?.[slug]?.push,
            day1Payload(t, id, slug, nameOf[slug] || slug)
          );
          day1 += r.sent; errors.push(...r.errors);
        }
        // Time-boxed: retrying after the deadline is pointless, so flag either
        // way and let the in-app countdown carry it from here.
        await put(`${ROOT}/tasks/${id}/notified/day1`, true);
      }
    }

    return res.status(200).json({
      ok: true, newTaskPushes: created, dayOnePushes: day1,
      errors: errors.length ? errors : undefined
    });
  } catch (e) {
    return res.status(500).json({ error: String(e.message || e) });
  }
}
