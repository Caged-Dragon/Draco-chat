// Supabase Edge Function: send-push
//
// Deploy with: supabase functions deploy send-push        (JWT verification stays ON)
// Secrets:     supabase secrets set VAPID_PUBLIC_KEY=... VAPID_PRIVATE_KEY=... VAPID_SUBJECT=mailto:you@example.com
//
// Called from the client after sending a message:
//   supabase.functions.invoke('send-push', { body: { userId, title, body, url } })
//
// Security: the caller must be signed in, must be an accepted friend of the
// target user, and must not be blocked by them. Dead (410/404) subscriptions
// are cleaned up automatically.

import { createClient } from 'npm:@supabase/supabase-js@2.45.4';
import webpush from 'npm:web-push@3.6.7';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!;
const VAPID_PUBLIC_KEY = Deno.env.get('VAPID_PUBLIC_KEY');
const VAPID_PRIVATE_KEY = Deno.env.get('VAPID_PRIVATE_KEY');
const VAPID_SUBJECT = Deno.env.get('VAPID_SUBJECT') ?? 'mailto:admin@example.com';

const vapidReady = Boolean(VAPID_PUBLIC_KEY && VAPID_PRIVATE_KEY);
if (vapidReady) webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY!, VAPID_PRIVATE_KEY!);

const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  });
}

function clip(value: unknown, max: number) {
  return String(value ?? '').slice(0, max);
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  try {
    if (!vapidReady) return json({ error: 'Push is not configured (missing VAPID secrets)' }, 503);

    // 1) Who is calling?
    const authHeader = req.headers.get('Authorization') ?? '';
    const userClient = createClient(SUPABASE_URL, ANON_KEY, { global: { headers: { Authorization: authHeader } } });
    const { data: userData, error: userErr } = await userClient.auth.getUser();
    if (userErr || !userData?.user) return json({ error: 'Unauthorized' }, 401);
    const callerId = userData.user.id;

    // 2) Validate input
    const { userId, title, body, url } = await req.json();
    if (!userId || !title) return json({ error: 'userId and title are required' }, 400);
    if (userId === callerId) return json({ sent: 0, reason: 'cannot notify yourself' });

    // Only same-origin relative paths are allowed as the click target
    const safeUrl = typeof url === 'string' && url.startsWith('/') && !url.startsWith('//') ? url : '/';

    // 3) Caller must be an accepted friend of the target and not blocked
    const { data: friendship } = await admin
      .from('friendships')
      .select('id')
      .eq('status', 'accepted')
      .or(
        `and(requester_id.eq.${callerId},addressee_id.eq.${userId}),and(requester_id.eq.${userId},addressee_id.eq.${callerId})`
      )
      .maybeSingle();
    if (!friendship) return json({ error: 'Forbidden' }, 403);

    const { data: block } = await admin
      .from('blocks')
      .select('id')
      .or(
        `and(blocker_id.eq.${userId},blocked_id.eq.${callerId}),and(blocker_id.eq.${callerId},blocked_id.eq.${userId})`
      )
      .maybeSingle();
    if (block) return json({ sent: 0, reason: 'blocked' });

    // 4) Send to every device the target has registered
    const { data: subs, error } = await admin
      .from('push_subscriptions')
      .select('id, endpoint, p256dh, auth_key')
      .eq('user_id', userId);
    if (error) throw error;
    if (!subs || subs.length === 0) return json({ sent: 0, reason: 'no subscriptions' });

    const payload = JSON.stringify({ title: clip(title, 80), body: clip(body, 200), url: safeUrl });

    const results = await Promise.allSettled(
      subs.map((s) =>
        webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth_key } }, payload)
      )
    );

    const deadIds: string[] = [];
    results.forEach((r, i) => {
      if (r.status === 'rejected' && (r.reason?.statusCode === 404 || r.reason?.statusCode === 410)) {
        deadIds.push(subs[i].id);
      }
    });
    if (deadIds.length > 0) await admin.from('push_subscriptions').delete().in('id', deadIds);

    return json({ sent: results.filter((r) => r.status === 'fulfilled').length, total: subs.length });
  } catch (err) {
    console.error('send-push failed', err);
    return json({ error: 'Internal error' }, 500);
  }
});
