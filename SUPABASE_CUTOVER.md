# Supabase cutover handoff

The destination project is `kckxfhhehcxfcrsxaofb` (`https://kckxfhhehcxfcrsxaofb.supabase.co`).

## Completed

- Applied the exported schema, functions, triggers, policies, and storage buckets.
- Enabled RLS on all 39 public tables.
- Imported all 757 exported application rows with matching counts.
- Created all 36 Auth users with their original UUIDs and confirmation states.
- Restored all 36 exported bcrypt password hashes and email identities; users do not need password resets.
- Restored phone metadata for all 36 users; all 36 public profile phone numbers already match after normalization.
- Uploaded all five exported avatar files.
- Enabled `pg_net` and `pg_cron`.

## Deployment environment

Set these in the server/deployment secret manager. Keep the secret key server-only.

```text
SUPABASE_PROJECT_ID=kckxfhhehcxfcrsxaofb
SUPABASE_URL=https://kckxfhhehcxfcrsxaofb.supabase.co
SUPABASE_SERVICE_ROLE_KEY=<destination sb_secret key>
SUPABASE_PUBLISHABLE_KEY=<destination sb_publishable key>
VITE_SUPABASE_PROJECT_ID=kckxfhhehcxfcrsxaofb
VITE_SUPABASE_URL=https://kckxfhhehcxfcrsxaofb.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=<same destination sb_publishable key>
```

Also copy the existing non-Supabase production secrets for Paystack, Pingram, Telegram, VAPID, and cron authentication. Do not put `SUPABASE_SERVICE_ROLE_KEY` or any provider secret in a `VITE_` variable.

## Auth follow-up

The exported password hashes and email identities are restored. Users may need to sign in again because sessions from the old Supabase project are not portable, but they do not need to reset their passwords. Seven accounts remain email-unconfirmed and should complete the normal confirmation flow before sign-in if the destination Auth settings require confirmed email.

Before cutover, configure the destination Auth site URL, redirect URLs, SMTP/email provider, and branded email templates. Recreate the two scheduled HTTP jobs after the production URL and cron secret are known:

- `0 11 * * *` UTC → `/api/public/jobs/loan-reminders`
- `0 23 * * *` UTC → `/api/public/jobs/birthday-greetings`

Keep Lovable Cloud available until the destination deployment passes sign-in, checkout, wallet, storage, and scheduled-job smoke tests.
