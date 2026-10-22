// Supabase Edge Function: send-push
//
// Deploy with: supabase functions deploy send-push
// Requires these secrets set first:
//   supabase secrets set VAPID_PUBLIC_KEY=... VAPID_PRIVATE_KEY=... VAPID_SUBJECT=mailto:you@example.com
//
// Called from the client after sending a message, like:
//   supabase.functions.invoke('send-push', { body: { userId, title, body, url } })
//
// This function looks up every push subscription the target user has
// registered (they may have multiple devices) and sends the same
// notification to each one. A subscription that the browser has since
// revoked (410 Gone / 404) is cleaned up automatically.

import { createClient } from 'npm:@supabase/supabase-js@2.45.4';
import webpush from 'npm:web-push@3.6.7';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL');
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
const VAPID_PUBLIC_KEY = Deno.env.get('VAPID_PUBLIC_KEY');
const VAPID_PRIVATE_KEY = Deno.env.get('VAPID_PRIVATE_KEY');
const VAPID_SUBJECT = Deno.env.get('VAPID_SUBJECT') ?? 'mailto:admin@example.com';

webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

Deno.serve(async (req) => {
  try {
    const { userId, title, body, url } = await req.json();
    if (!userId || !title) {
      return new Response(JSON.stringify({ error: 'userId and title are required' }), {
        status: 400,
      });
    }

    const { data: subs, error } = await supabase
      .from('push_subscriptions')
      .select('id, endpoint, p256dh, auth_key')
      .eq('user_id', userId);

    if (error) throw error;
    if (!subs || subs.length === 0) {
      return new Response(JSON.stringify({ sent: 0, reason: 'no subscriptions' }), { status: 200 });
    }

    const payload = JSON.stringify({ title, body: body ?? '', url: url ?? '/' });

    const results = await Promise.allSettled(
      subs.map((s) =>
        webpush.sendNotification(
          {
            endpoint: s.endpoint,
            keys: { p256dh: s.p256dh, auth: s.auth_key },
          },
          payload
        )
      )
    );

    const deadIds = [];
    results.forEach((r, i) => {
      if (r.status === 'rejected' && (r.reason?.statusCode === 404 || r.reason?.statusCode === 410)) {
        deadIds.push(subs[i].id);
      }
    });
    if (deadIds.length > 0) {
      await supabase.from('push_subscriptions').delete().in('id', deadIds);
    }

    const sent = results.filter((r) => r.status === 'fulfilled').length;
    return new Response(JSON.stringify({ sent, total: subs.length }), { status: 200 });
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), { status: 500 });
  }
});
