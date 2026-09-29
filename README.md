# Jaap Tally Web

The Next.js web app for daily jaap tallies and practice insights.

Use the date picker to add or edit a tally for any past date. The seven-day cards are quick shortcuts, and **Show all tallies** reveals older saved entries.

## Run locally

Requires Node.js 20.9 or newer.

```bash
npm install
npm run dev
```

Open http://localhost:3000. Entries are saved in browser storage when Supabase is not configured.

## Optional Supabase connection

Copy `.env.example` to `.env.local` and set the project URL and publishable key. Use the same Supabase project as the mobile app, with anonymous authentication enabled and its `jaap_entries` table and row policies installed. Never use a secret or service-role key in the browser.

Mobile and web currently create separate anonymous users, so their entries do not automatically appear on both devices.

## Checks

```bash
npm run lint
npm run typecheck
npm run build
```
