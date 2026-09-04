import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

// BUG FIX: supabase-js throws synchronously ("supabaseUrl is required.")
// if either value is missing, which crashes the whole module at import
// time — before React even mounts — leaving a blank white page with no
// on-screen hint of why. This is the single most common "the app is
// completely broken" report for a freshly cloned copy that hasn't had
// its .env set up yet (or had it added without restarting `npm run dev`).
// Fail with a message actually visible on the page instead.
if (!supabaseUrl || !supabaseAnonKey) {
  const message =
    'Dragon Chat is missing its Supabase config.\n\n' +
    'Copy .env.example to .env, fill in VITE_SUPABASE_URL and ' +
    'VITE_SUPABASE_ANON_KEY from your Supabase project ' +
    '(Project Settings \u2192 API), then restart `npm run dev`.';
  document.body.innerHTML =
    '<div style="font-family:sans-serif;max-width:520px;margin:80px auto;' +
    'padding:24px;white-space:pre-wrap;line-height:1.5;">' +
    message +
    '</div>';
  throw new Error(message);
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

