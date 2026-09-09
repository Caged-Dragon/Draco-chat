# 🐉 Dragon Chat (v5.5)

*Connect Different. Chat Real.*

A full-featured, installable chat web app: 1:1 and group messaging,
voice/video calling (1:1 and group), presence, reactions, per-user
theming, status/stories, and more. Built by **Caged Dragon Studios**.

**Stack:** React + Vite (frontend) · Supabase (auth, database, realtime, storage) · GitHub + Vercel (hosting)

---

## v5.5 — Installable as a native-feeling app (PWA)

Dragon Chat can now be installed straight from the browser, no app
store needed:

- **Android / Chrome / Edge / desktop Chrome** — a branded "Install
  Dragon Chat" popup appears automatically once the browser decides
  the site is installable (usually a couple seconds after load). It
  uses the browser's real install flow under the hood
  (`beforeinstallprompt`), just with our own styled button instead of
  the generic browser banner.
- **iOS Safari** — Apple doesn't support that same install API, so
  instead the popup shows the manual steps: *tap Share, then Add to
  Home Screen*. Once added, it opens full-screen with no Safari
  address bar, exactly like a native app.
- Installed app gets a proper home-screen icon, splash behavior, and
  standalone window — no browser chrome.
- Basic **offline app-shell caching** via a generated service worker —
  the app itself will still open without a connection (though live
  data like chat, calls, and login obviously still need one).
- The popup respects the person's choice: dismiss it and it won't
  reappear for 7 days, and it never shows at all once the app is
  actually installed.

**New/changed files:** `vite.config.js` (PWA plugin config),
`index.html` (iOS meta tags), `src/components/InstallPrompt.jsx`
(new), `src/App.jsx` (renders it globally), plus generated icons in
`public/` (`icon-192.png`, `icon-512.png`, `icon-512-maskable.png`,
`apple-touch-icon.png`). **New dependency:** `vite-plugin-pwa` — run
`npm install` after pulling this update. No Supabase/schema changes.

---

## v5.4 — Status / Stories

New feature, like WhatsApp Status or Instagram Stories:

- A horizontal row of circular avatars at the top of the sidebar —
  "Your status" first, then any friends with an active story. A
  gradient ring means there's something new to see; a muted ring means
  you've already viewed everything that person posted.
- **Post a text status** (short message on a colored background, pick
  from 8 preset colors) or an **image status** (with an optional
  caption).
- Tap a circle to open a **full-screen viewer** with Instagram-style
  progress bars across the top, auto-advancing every 5 seconds. Tap
  the left/right edge of the screen to go back/forward; press and hold
  anywhere to pause.
- **Statuses expire after 24 hours** automatically (enforced at the
  database level — a status simply stops being visible to others past
  its `expires_at`, no cleanup job required).
- On your own statuses, tap "Viewed by" at the bottom to see exactly
  who's seen it and when, and a 🗑 button to delete a status early.

**New tables:** `statuses`, `status_views`. **New storage bucket:**
`status-media`. All covered by the usual full `supabase/schema.sql` —
re-run it (idempotent) to pick this up. No existing tables changed.

### Known limits
- Expired statuses aren't actively deleted from the database, just
  hidden by Row Level Security — fine at small scale, but a scheduled
  cleanup (e.g. a `pg_cron` job) would be a sensible addition if this
  grows.
- No "close friends" / custom audience list yet — a status is visible
  to *all* of your accepted friends, same as everyone else's.

---

## v5.3.1 patch notes

Mobile overflow issues (chat header, input row, Send button hidden)
kept resurfacing across incremental CSS patches — most likely because
manually pasted snippets left old/conflicting rules in place, and CSS
silently lets the *last* matching rule win regardless of which one is
"correct." Rather than patch the stylesheet again, chat headers and
input rows (`ChatWindow.jsx`, `GroupChatWindow.jsx`, `Dashboard.jsx`)
now compute their sizing in JavaScript from the real, live
`window.innerWidth` (via a new `useViewportWidth` hook) and apply it
as inline styles. Inline styles always win over any stylesheet rule,
so this is immune to the exact class of bug that kept recurring — it
no longer matters what state `styles.css` is in for these elements.

---

## v5.3 patch notes

- **Fixed a real overflow bug**: a CSS rule meant only for the "Send"
  button (`.chat-input button`) was also styling the emoji/attach/mic
  icon buttons as giant gradient pills, pushing Send off-screen on
  phones. The icon buttons and text input also lacked `min-width: 0`,
  which is what let the row overflow the viewport in the first place.
  Both are fixed, plus a global `overflow-x: hidden` safety net on
  `<body>` so this class of bug can't cause page-wide horizontal
  scrolling again.
- **Friend search is now live** — results appear as you type (debounced
  ~300ms), no more pressing Enter or a "Find" button.
- **Friend requests/acceptances and group invites** now have a 15-second
  polling fallback in addition to realtime, so they show up without a
  manual refresh even if realtime replication isn't active on your
  Supabase project for some reason.
- **More fluid sizing** — chat header padding, message bubbles, and
  friend list text now scale smoothly with screen width (`clamp()`)
  instead of only jumping at fixed breakpoints.

---

## v5.2 patch notes

- **Usernames are now editable** from the Profile modal (previously
  locked at signup). Renaming checks for uniqueness and shows a clear
  error ("That username is already taken") if it's in use.
- **Every account now has a permanent numeric ID** (`user_number`),
  assigned automatically by the database the moment the account is
  created, and shown in the Profile modal as a Dragon Chat ID (e.g.
  `#000123`). It never changes — even if the username is renamed —
  and a database trigger blocks it from being altered by any client
  request.

If you're upgrading from v5.1, **re-run the full `supabase/schema.sql`**
(safe, idempotent) — it backfills a `user_number` for every existing
account automatically.

---

## v5.1 patch notes

Two bugs fixed after real-world testing of v5:

1. **Group creation could fail** — a circular Row Level Security check
   meant the group creator couldn't add friends as members right after
   creating a group (their own membership row would insert fine, but
   everyone else's would be silently rejected, rolling back the whole
   insert). Fixed by letting the creator see their own group immediately
   instead of only after they're already a member.
2. **Friend requests, acceptances, and being added to a group required a
   manual page reload to show up** — `friendships` and `groups` were
   never added to Supabase's realtime publication, and the sidebar
   components had no live subscription to begin with. Both are fixed:
   the tables are now realtime-enabled, and `FriendRequests.jsx`,
   `FriendsList.jsx`, and `GroupsList.jsx` all subscribe to live changes
   instead of only refreshing on the current user's own actions.

If you're upgrading from v5.0, **re-run the full `supabase/schema.sql`**
(safe, idempotent) to pick up both fixes.

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

## Extending it later

- A TURN server (see `.env` above) for more reliable calling
- Push notifications via a service worker + Web Push (would also want a
  small backend/Edge Function to trigger them)
- Rich link-preview cards (needs a backend URL-metadata fetcher)
- Group-chat reactions and read receipts
- An SFU-based group call service for larger groups
