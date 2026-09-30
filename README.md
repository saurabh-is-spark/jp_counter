# Jaap Tally Web

The Next.js web app for daily jaap tallies and practice insights.

Use the date picker to add or edit a tally for any past date. The seven-day cards are quick shortcuts, and **Show all tallies** reveals older saved entries.

## Run locally

Requires Node.js 20.9 or newer.

```bash
npm install
npm run dev
```

Open http://localhost:3000. Configure Supabase below to register or log in.

## Supabase authentication

Copy `.env.example` to `.env.local` and set the project URL and publishable key. Use the same Supabase project as the mobile app, with its `jaap_entries` table and ownership policies installed. Never use a secret or service-role key in the browser.

In Supabase Authentication, enable the Email provider and email/password signups. Set the Site URL to `https://jp-counter-two.vercel.app`, and add the following redirect URLs:

- `https://jp-counter-two.vercel.app/auth/callback`
- `https://jp-counter-two.vercel.app/auth/callback?flow=recovery`
- `http://localhost:3000/auth/callback`
- `http://localhost:3000/auth/callback?flow=recovery`

Email confirmation is supported: after registering, follow the confirmation email and then log in. Password reset emails return to the same callback page. Configure a production SMTP provider for reliable delivery to users.

Tallies are saved using the signed-in Supabase user's ID. Browser caches are separated by user ID. Logging into an account on another browser loads that account's cloud tallies. Existing anonymous browser tallies can be explicitly imported after login; account dates take precedence and the old browser copy is preserved.

The mobile app still uses anonymous authentication. It needs the same account login flow before it can share the web account's tallies. No database migration is needed when the existing policies enforce `auth.uid() = user_id` for SELECT, INSERT, and UPDATE.

## Checks

The test command requires Node.js 22.13 or newer for TypeScript support.

```bash
npm run lint
npm run typecheck
npm test
npm run build
```
