# Campus Delight — Build Roadmap (PRD v1.2)

Scope decision: build everything (phases 1–4) in this session; seed demo data; Paystack keys provided.

## Tasks
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
- [ ] Tests for PRD rules (transfer limit/fee, credit limit rules, entitlement caps, no cash+token mix)
- [ ] Head metadata review on all routes
