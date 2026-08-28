# 🐉 Dragon Chat

*Connect Different. Chat Real.*

A WhatsApp/Instagram-DM-style chat website: login/signup, friend
requests (send/accept/decline), a friends list, and a realtime
one-to-one text chat. Built by **Caged Dragon Studios**.

**Stack:** React + Vite (frontend) · Supabase (auth, database, realtime) · GitHub + Vercel (hosting)

---

## 1. Supabase setup

1. Go to https://supabase.com → create a new project.
2. Open **SQL Editor** → paste the entire contents of `supabase/schema.sql`
   → click **Run**. This creates:
   - `profiles` (one row per user, auto-created on signup)
   - `friendships` (requester → addressee, with a `status` of
     `pending` or `accepted` — the real request/accept flow)
   - `messages` (chat messages)
   - Row Level Security policies so users can only see their own data
   - Realtime enabled on `messages`
3. Go to **Project Settings → API**. Copy:
   - `Project URL`
   - `anon public` key
4. (Optional but recommended for testing) Go to **Authentication → Providers
   → Email** and turn OFF "Confirm email" while developing, so you can
   sign up and log in immediately without checking an inbox. Turn it back
   on before going live.

## 2. Local setup

```bash
npm install
cp .env.example .env
```

Edit `.env` and paste in your Supabase URL and anon key:

```
VITE_SUPABASE_URL=https://YOUR-PROJECT-REF.supabase.co
VITE_SUPABASE_ANON_KEY=YOUR-ANON-PUBLIC-KEY
```

Run it locally:

```bash
npm run dev
```

Open the printed localhost URL. Sign up two different accounts (e.g. a
normal window and an incognito window) to test the request → accept →
chat flow between them.

## 3. Push to GitHub

```bash
git init
git add .
git commit -m "Dragon Chat"
git branch -M main
git remote add origin https://github.com/AshwinrajB/YOUR-REPO-NAME.git
git push -u origin main
```

(`.env` is already in `.gitignore` so your keys won't be committed.)

## 4. Deploy on Vercel

1. Go to https://vercel.com → **Add New → Project** → import the GitHub repo.
2. Vercel auto-detects Vite. Leave build settings as default
   (`npm run build`, output dir `dist`).
3. Under **Environment Variables**, add the same two values from your
   `.env` file:
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_ANON_KEY`
4. Click **Deploy**. Once it finishes you'll get a live `.vercel.app` URL.

## How it works

- **Login/logout** — `src/contexts/AuthContext.jsx` wraps Supabase Auth
  (`signUp`, `signInWithPassword`, `signOut`) and exposes the current
  session to the whole app.
- **Search for friends** — `SearchFriends.jsx` queries `profiles` by
  username and inserts a `pending` row into `friendships` when you hit
  Add — this sends a request, it does not add them instantly.
- **Friend requests** — `FriendRequests.jsx` shows requests where you're
  the addressee and are still `pending`. Accept flips the row to
  `accepted`; Decline deletes it.
- **Friends list** — `FriendsList.jsx` reads `friendships` rows with
  `status = 'accepted'` where you're on either side, and lists the
  other person.
- **Chat screen** — `ChatWindow.jsx` loads message history between the
  two users from `messages`, then subscribes to Supabase Realtime so
  new messages appear instantly on both sides without refreshing.
- **Branding** — `public/logo.png` is the Dragon Chat mark, shown on the
  login card and in the sidebar header. Update `index.html`'s `<title>`
  or the "Built by Caged Dragon Studios" line in `Login.jsx` if you want
  to change the credit.

## Extending it later

- Add read receipts / "online" status using Supabase Presence.
- Add profile pictures (Supabase Storage bucket + `avatar_url` column).
- Add typing indicators via a Realtime broadcast channel.
- Add an "unfriend" button (delete the accepted `friendships` row).
