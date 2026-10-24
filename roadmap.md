# Campus Delight — Build Roadmap (PRD v1.2)

Scope decision: build everything (phases 1–4) in this session; seed demo data; Paystack keys provided.

## Tasks
- [x] CSV export on the admin Customers page covering the rows shown (customer ID, referral code, name, email, phone, outlet, joined, status, verified); browser-verified download plus 6 escaping/format tests; 35 tests pass.
- [x] Update existing and new customer IDs and referral codes to CD plus six random digits; database checks, 100 simulated signups, existing-account conversion and signed-in profile verified; 28 tests pass.
- [x] Add dashboard Eat now, pay later button; verified signed-in navigation and 12 customer pages plus homepage at 320, 390, 770, 1024 and 1440px. Shared navigation, summaries, tables and dialogs adapt to small screens; 26 existing rule tests pass. Role-specific admin/outlet screens were reviewed in source, not signed-in browser tested.
- [x] Remove direct card checkout and restore original Paystack funding/subscription options; preserve verification safeguards and existing payment records. Verified signed-in pages and 22 rule tests.
- [x] Require email confirmation after registration and restore email/password sign-in; hosted settings confirmed, rule tests and simulated unconfirmed-sign-in browser flow pass.
- [ ] Verify actual confirmation email delivery and link-to-sign-in flow — requires access to a customer's confirmation email; no inbox available in this session.
- [x] Enable Lovable Cloud + email auth
- [x] Paystack secrets saved (PAYSTACK_SECRET_KEY, PAYSTACK_PUBLIC_KEY)
- [x] DB schema: outlets, profiles, roles, staff
- [x] DB schema: wallets, token accounts, ledgers, transfers, referrals, OTP
- [x] DB schema: subscriptions, plan pricing, entitlements
- [x] DB schema: menus, orders, payments
- [x] DB schema: outlet transfers, loans, credit limits, notifications, audit
- [x] DB RPCs: atomic token transfer, wallet funding, order placement, entitlement redemption, loan lifecycle, referral rewards
- [x] Seed: 11 outlets + sample menus/prices/system config
- [x] Auth pages: sign up (outlet selection), sign in, reset password
- [x] Customer dashboard: home, subscription, order food, wallet, tokens, transfers, referrals, Eat Now & Pay Later, repayments, history, outlet transfer, profile
- [x] Outlet dashboard: overview, orders, fulfillment, subscriptions, customers, menu/pricing, food credit, staff, reports, settings
- [x] Central admin dashboard: outlets, customers, financial oversight, ledgers, transfers, referrals, credit, reports, audit, settings
- [x] Paystack: initialize + verify + webhook (idempotent)
- [x] Build errors fixed; project builds clean (2026-10-24T18:37Z)
- [x] Runtime smoke test: landing + auth pages render clean (no console errors)
- [x] Tests for PRD rules: src/test/prd-rules.test.ts (welcome tokens, transfer cap/fee, credit limit doubling/−30%, one payment method only) — entitlement caps still live in the database only
- [x] Head metadata review: unique title/description + og & twitter meta on public routes; layout routes carry none by design
