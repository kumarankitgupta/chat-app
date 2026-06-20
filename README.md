# Private Chat

A small password-protected Next.js chat app with Supabase-backed text, image, video, last-seen, and read/unread state.

Only two chat identities are allowed: `bubu` and `buggu`.

## Local Setup

1. Install dependencies:

```bash
npm install
```

2. Run the SQL in `supabase-setup.sql` inside the Supabase SQL editor.

3. Start the app:

```bash
npm run dev
```

4. Open `http://localhost:3000`.

The server-only password is in `.env.local` as `CHAT_PASSWORD`. The current password is `bubulovebuggu`.

## Supabase Notes

- Messages are stored in `public.messages`.
- Last-seen state is stored in `public.chat_presence`.
- Images and videos are stored in the public `chat-media` bucket.
- Row policies only allow `bubu` and `buggu` to create messages and presence records.
- Realtime is enabled in the setup SQL. The app also polls every few seconds, so it still updates if Realtime is delayed.
