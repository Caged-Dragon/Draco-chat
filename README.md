# 🐉 Dragon Chat (v5)

*Connect Different. Chat Real.*

A full-featured chat web app: 1:1 and group messaging, voice/video calling
(1:1 and group), presence, reactions, per-user theming, and more. Built by
**Caged Dragon Studios**.

**Stack:** React + Vite (frontend) · Supabase (auth, database, realtime, storage) · GitHub + Vercel (hosting)

---

## Feature list

**Auth & security** — email/password + GitHub OAuth, real email
verification, forgot password, Row Level Security on every table.

**Friends** — search, real request/accept/decline flow, unfriend, block,
report.

**1:1 chat** — realtime text, image/document/voice-message attachments,
typing indicators, read receipts (✓/✓✓), message reactions, edit/delete,
reply/quote, in-chat search, clickable links, online/offline + "last seen"
presence, unread badges + document title counter.

**Groups** — create a group with any of your friends, group text chat with
attachments/typing/reply/edit/delete, group voice/video calls (mesh
WebRTC — see note below).

**Calling** — 1:1 voice/video (WebRTC + Supabase Realtime signaling, no
extra backend), call history log, mute/camera toggle, screen sharing.

**Profile** — avatar upload, status message, manual presence status
(online/away/busy/DND).

**Customization** — 12+ global theme colors with a live full-app mockup
preview, one-click Light/Dark presets, per-chat color overrides, global +
per-chat wallpaper images.

**Landing page** — animated marketing page shown before login.

---

## Known scope limits (by design, not bugs)

- **No TURN server included** — calls use free public STUN servers only.
  Works on most networks; can fail across some strict corporate/carrier
  NATs. Set `VITE_TURN_URL` / `VITE_TURN_USERNAME` / `VITE_TURN_CREDENTIAL`
  (see below) to add one from a provider like Twilio or Metered.ca.
- **Group calls are full-mesh**, not routed through a media server —
  every participant connects directly to every other participant. Fine
  for small groups (~2-6 people); bandwidth/CPU cost rises with each
  additional person.
- **Link previews are click-only**, not rich unfurled cards (no page
  title/image fetch) — that needs a backend fetcher to get around
  browser CORS restrictions, which this app doesn't have.
- **No push notifications when the app is fully closed** — calls and
  messages only reach you while the app is open in a tab (via Realtime),
  since real push needs a service worker + backend, intentionally skipped
  for now.
- **Group chat doesn't have reactions or per-member read receipts** (1:1
  chat only) — kept out to keep the group data model simpler.

---

## 1. Supabase setup

1. Go to https://supabase.com → create a new project.
2. Open **SQL Editor** → paste the **entire contents** of
   `supabase/schema.sql` → click **Run**. It's fully idempotent (safe to
   re-run any time you update the file) and sets up:
   - `profiles` (avatar, status message, presence, last seen)
   - `friendships` (request/accept flow)
   - `messages` (attachments, reply, edit, delete, read receipts)
   - `message_reactions`
   - `blocks`, `reports`
   - `calls` (call history)
   - `groups`, `group_members`, `group_messages`
   - Storage buckets: `chat-attachments`, `chat-wallpapers`, `avatars`
   - Row Level Security policies on everything
   - Realtime enabled on the live-updating tables
3. Go to **Project Settings → API**. Copy the **Project URL** and
   **anon public** key.

## 2. Auth setup

### Email verification
**Authentication → Providers → Email** → make sure **"Confirm email"** is
ON.

### Redirect URLs
**Authentication → URL Configuration**:
- **Site URL** → your production URL (e.g. `https://your-app.vercel.app`)
- **Redirect URLs** → add both `http://localhost:5173` and your
  production URL

### GitHub OAuth
1. [GitHub Developer Settings](https://github.com/settings/developers) →
   **New OAuth App**.
2. **Authorization callback URL**:
   `https://YOUR-PROJECT-REF.supabase.co/auth/v1/callback`
3. Copy the **Client ID** and generate a **Client Secret**.
4. Supabase → **Authentication → Providers → GitHub** → paste both in.

## 3. Local setup

```bash
npm install
cp .env.example .env
```

Edit `.env`:

```
VITE_SUPABASE_URL=https://YOUR-PROJECT-REF.supabase.co
VITE_SUPABASE_ANON_KEY=YOUR-ANON-PUBLIC-KEY

# Optional — only needed if you want to add a TURN server for calling
# reliability across strict networks:
# VITE_TURN_URL=turn:your-turn-server:3478
# VITE_TURN_USERNAME=your-username
# VITE_TURN_CREDENTIAL=your-credential
```

```bash
npm run dev
```

Test with **three separate logged-in sessions** (different browsers or
one incognito) for friend requests, chat, and calling — two tabs of the
same normal browser window share one login session.

## 4. Push to GitHub

```bash
git add .
git commit -m "Dragon Chat v5"
git push
```

## 5. Deploy on Vercel

Vercel auto-deploys on every push to `main` once connected. If this is a
fresh project: **Add New → Project** → import the repo → add the same
env vars from `.env` under **Environment Variables** → **Deploy**.

After deploying, add your live `.vercel.app` URL to Supabase's
**Redirect URLs** if you haven't already.

---

## How it works (v5 additions)

- **Presence** — `contexts/PresenceContext.jsx` uses Supabase Realtime
  Presence on a shared `presence-global` channel; also writes
  `last_seen_at` on a heartbeat so "last seen" stays accurate.
- **Unread counts** — `contexts/UnreadContext.jsx` tracks per-friend
  unread counts from `messages.read_at`, updates the browser tab title,
  and exposes `markRead()` called when a chat opens.
- **Typing / read receipts / reactions / edit / delete / reply** — all
  live in `ChatWindow.jsx` + `MessageBubble.jsx`, using Realtime broadcast
  (typing) and `postgres_changes` UPDATE events (everything else) on the
  same per-conversation channel.
- **Voice messages** — recorded client-side with the `MediaRecorder` API,
  uploaded to the `chat-attachments` bucket as a `.webm` file.
- **Calling** — `contexts/CallContext.jsx` (1:1) and
  `contexts/GroupCallContext.jsx` (group) both do WebRTC signaling over
  Supabase Realtime broadcast channels — no separate signaling server.
  Call outcomes (`completed`/`missed`/`declined`) log to the `calls`
  table for `CallHistoryModal.jsx`.
- **Groups** — a parallel table set (`groups`/`group_members`/
  `group_messages`) so the original 1:1 chat logic is untouched.
  `GroupChatWindow.jsx` and `GroupsList.jsx` handle the UI;
  `GroupCallContext.jsx` handles group calling.
- **Blocking** — `blocks` table plus a database-level check in the
  `messages` insert policy, so a block is enforced even if the UI is
  bypassed.
- **Theming** — unchanged architecture from v3/v4: CSS custom properties
  applied globally (`ThemeContext`) or scoped per-chat via inline style
  on `ChatWindow`'s root element. `DARK_THEME` in `theme/fields.js` is
  just another theme object, applied the same way as any custom one.

## Bug fixes (this pass)

- **Groups feature was completely broken — Postgres RLS infinite recursion.**
  `group_members`'s own "select" policy queried `group_members` from
  inside its own `USING` clause. Postgres detects that as a circular
  policy dependency and refuses the query with `infinite recursion
  detected in policy for relation "group_members"` — which broke every
  read of that table (group lists, group membership, group chat
  windows), and transitively broke `groups` too since its policy checks
  membership the same way. Fixed with a `SECURITY DEFINER` helper
  function (`is_group_member`) that the policies call instead of
  querying the table directly — this is the standard, Supabase-documented
  way to break this kind of cycle. **You need to re-run `supabase/schema.sql`
  in the SQL Editor for this fix to take effect** — it's a database
  change, not something a code deploy alone fixes.
- **Blank white screen when `.env` isn't set up.** `supabaseClient.js`
  used to call `createClient()` with possibly-empty values, which throws
  synchronously and crashes the whole app before anything renders — with
  nothing on screen to say why. It now shows a plain-language on-page
  message telling you to fill in `.env` instead of silently failing.
- **`package-lock.json` was out of sync with `package.json`** (lockfile
  said version `1.0.0`/wrong name, `package.json` says `5.0.0`). Some
  npm versions and CI setups refuse to run `npm ci` when these disagree.
  Synced.
- **Removed stale duplicate files** — `ChatThemeModel.jsx`, `SettingModel.jsx`,
  and `ThemePreview.jsx` were leftovers from an earlier design (they imported
  `FIELD_GROUPS` from `theme/fields.js`, which no longer exists — only
  `THEME_TABS` does now). They weren't imported anywhere, so they didn't
  break the build, but they were dead, broken code. The live components are
  `ChatThemeModal.jsx` and `SettingsModal.jsx`.
- **Fixed a realtime channel leak in `ChatWindow.jsx`** — the per-conversation
  `reactions-*` Supabase channel was created inside `loadReactions()`, which
  runs on every `loadMessages()` call, but its cleanup function was never
  captured or called. Switching between conversations repeatedly left old
  reaction channels open for the rest of the session. The reactions channel
  is now created once per `friend.id` alongside the main chat channel and
  torn down together with it.
- **Fixed a stale-closure bug in the same handler** — the reactions listener
  checked incoming rows against the `messages` array as it existed at the
  moment the channel was created, so a reaction added to a message that
  arrived *later* in the same session (via the realtime `INSERT` handler)
  was silently dropped. It now checks against a ref that's kept in sync with
  the current message list on every render.
- **`signUp()`/`resendConfirmation()` didn't pass `emailRedirectTo`**, unlike
  `signInWithProvider`/`sendPasswordReset` which both set it explicitly —
  now consistent, so confirmation links always point back at the running
  app instead of relying on the dashboard's default Site URL.

**Not a code bug, but worth knowing:** if signup confirmation emails aren't
arriving at all, it's almost always because Supabase's built-in mailer is
test-only and throttled to ~3-4 emails/hour per project. Set up a real SMTP
provider (Resend, SendGrid, SES, Postmark — all have free tiers) under
**Project Settings → Authentication → SMTP Settings**.

## Extending it later

- A TURN server (see `.env` above) for more reliable calling
- Push notifications via a service worker + Web Push (would also want a
  small backend/Edge Function to trigger them)
- Rich link-preview cards (needs a backend URL-metadata fetcher)
- Group-chat reactions and read receipts
- An SFU-based group call service for larger groups
