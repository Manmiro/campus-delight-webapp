# Account entry and Feed Someone rollout

- Sign-in and sign-up submit validated credentials directly to Supabase.
- Keep hosted Supabase Auth CAPTCHA protection disabled before deploying these forms.
  Local development disables it in `supabase/config.toml`.
- Feed Someone looks up the student immediately when a complete eight-character
  Foodie ID (CD plus six digits) is entered. Older lookup responses are ignored
  when the ID changes, and failed lookups can be retried directly.
- Donors can open Paystack checkout and retry failures without an expiring
  browser verification token.
- Preserve confirmed-email checks, server-side gift validation, live database
  quotes, service-only settlement, and claimed receipt delivery.
- Gifting SQL remains proposed in `drizzle/proposed/feed_someone.sql`.
  Follow `drizzle/proposed/feed_someone.md` for business approval and the database
  release process before enabling checkout in an environment without that schema.
