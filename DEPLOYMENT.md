# GymDesk Deployment Guide (Single Gym)

This guide is for deploying GymDesk to a single gym. The buyer is responsible for
their own Supabase/hosting accounts and all related costs.

## 1) Prerequisites
- [ ] Node.js 22+ installed
- [ ] A Supabase project (https://supabase.com)
- [ ] A hosting provider for the frontend (Cloudflare Pages recommended, or any static host)
- [ ] Access to SMTP for password reset emails (Supabase Auth)

## 2) Clone & install
```bash
npm ci
```

## 3) Supabase setup
1. Create a new Supabase project.
2. Install the Supabase CLI (https://supabase.com/docs/guides/cli) if running locally or use the SQL editor.
3. Apply migrations from `supabase/migrations/` in order. Run via CLI:
   ```bash
   npx supabase link --project-ref <your-project-ref>
   npx supabase db push
   ```
   Or copy/paste each migration into the SQL editor.
4. (Optional) Seed plans/data. Do not use demo seeds for production; create gym details and plans in Settings.

## 4) Environment variables
Create `.env.local` (or set build-time env vars in your host):

```env
VITE_SUPABASE_URL=https://<your-project-ref>.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=<your-publishable-key>
```

**Never** put `SUPABASE_SERVICE_ROLE_KEY` in the client bundle. Server-only secrets
go to Cloudflare Pages Functions / your server environment (see `functions/` README
notes in `README.md`).

## 5) Auth configuration (Supabase)
In Supabase Auth → URL Configuration:
- **Site URL**: `https://your-domain.com`
- **Redirect URLs**: add `https://your-domain.com` and `https://your-domain.com/reset-password` (if used)

Enable email/password auth. For reliable password resets, configure a custom SMTP provider.

## 6) Build & deploy
### Cloudflare Pages (recommended)
1. Build command: `npm run build`
2. Output directory: `dist`
3. Set the env vars above in Pages → Settings → Environment variables
4. `public/_redirects` already enables SPA routing

### Other hosts
Build with `npm run build` and serve `dist/` as a static SPA (all routes → `index.html`).

## 7) First-run checklist
- [ ] Login with the owner account created in Supabase Auth
- [ ] Set gym details in **Settings**
- [ ] Create membership plans in **Settings**
- [ ] Add a test member, sell a membership, collect a payment
- [ ] Test attendance check-in/check-out
- [ ] Test role restrictions (owner vs reception)
- [ ] Verify receipts and audit entries
- [ ] Test password reset flow

## 8) Backups & maintenance
- **Database**: Back up before schema changes. With Supabase, use scheduled backups or
  `pg_dump`. Test restoring to a throwaway project at least once.
- **App updates**: Apply new migrations before deploying updated code. Review
  `CHANGELOG.md` if provided.
- **Secrets**: Rotate keys if compromised. Never commit `.env.local`.

## Troubleshooting
- **"Workspace needs setup / offline"**: Check Supabase URL/key and that the project is running.
- **Auth redirects fail**: Verify Site URL and Redirect URLs in Supabase Auth.
- **Permission denied on data**: Ensure migrations are applied and the user has a gym assignment with correct role.
- **RLS errors**: Do not grant direct table access to browser roles; use the RPCs as designed.

## Support
Support terms are as agreed in the sales agreement (if any). Deployment bugs
unrelated to the delivered codebase are outside scope.
