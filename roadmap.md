# Campus Delight — Build Roadmap (PRD v1.2)

Scope decision: build everything (phases 1–4) in this session; seed demo data; Paystack keys provided.

## Tasks
- [x] Enable Lovable Cloud + email auth
- [x] Paystack secrets saved (PAYSTACK_SECRET_KEY, PAYSTACK_PUBLIC_KEY)
- [ ] DB schema: outlets, profiles, roles, staff
- [ ] DB schema: wallets, token accounts, ledgers, transfers, referrals, OTP
- [ ] DB schema: subscriptions, plan pricing, entitlements
- [ ] DB schema: menus, orders, payments
- [ ] DB schema: outlet transfers, loans, credit limits, notifications, audit
- [ ] DB RPCs: atomic token transfer, wallet funding, order placement, entitlement redemption, loan lifecycle, referral rewards
- [ ] Seed: 11 outlets + sample menus/prices/system config
- [ ] Auth pages: sign up (outlet selection), sign in, reset password
- [ ] Customer dashboard: home, subscription, order food, wallet, tokens, transfers, referrals, Eat Now & Pay Later, repayments, history, outlet transfer, profile
- [ ] Outlet dashboard: overview, orders, fulfillment, subscriptions, customers, menu/pricing, food credit, staff, reports, settings
- [ ] Central admin dashboard: outlets, customers, financial oversight, ledgers, transfers, referrals, credit, reports, audit, settings
- [ ] Paystack: initialize + verify + webhook (idempotent)
- [ ] Tests for PRD rules (transfer limit/fee, credit limit rules, entitlement caps, no cash+token mix)
- [ ] Head metadata on all routes
