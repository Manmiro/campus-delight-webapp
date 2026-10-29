# Campus Delight — Build Roadmap (PRD v1.2)

Scope decision: build everything (phases 1–4) in this session; seed demo data; Paystack keys provided.

## Tasks
- [x] Add animated delivery/pickup checkout with address, outlet-adjustable ₦600 initial fee in Menu & Pricing, atomic charges, receipts and fulfillment details. Signed-in pickup and adjusted-fee delivery purchases read back in history; both cancelled and tokens restored, outlet fee restored to ₦600. Mobile dialog fits without overflow; fee rules and manager isolation tested.
- [x] Scaffold and brand all six account email templates with the main logo, meal photo and green/gold design; managed webhook and dashboard previews retained.
- [ ] Activate branded account email delivery — waits on sender-domain DNS verification and publishing the current app.
- [x] Configure notify.campusdelight.net and fixed foodie transaction receipts; wire successful funding, subscriptions, transfers, rewards, orders/refunds, repayments, outlet fees/decisions and credit adjustments. Receipt rendered on desktop/phone; signed-in invalid transfer rejected, pages load without runtime errors; 51 targeted tests pass. No real payment or token debit performed.
- [ ] Verify a completed transaction reaches the inbox — blocked on notify.campusdelight.net DNS verification and then a real transaction; signup rewards send after email confirmation/sign-in, not immediately at registration. Delivery failures do not reverse completed transactions; no pre-verification sends are backfilled automatically.
- [x] Connect Pingram SMS for phone verification; saved key, real signed-in request accepted without exposing the code, and 12 focused SMS tests pass (59 total checks).
- [ ] Confirm receipt of the test SMS and enter its code — awaits the account owner checking their phone; provider acceptance alone does not prove delivery.
- [x] Add public sample Privacy and Terms pages and links from registration, homepage and profile; desktop/phone pages and profile link verified, no page errors or phone overflow.
- [ ] Finalise policies — awaits verified operator name/address/privacy contact, retention/refund and age policies, and Nigerian legal review of privacy and food-credit terms.
- [x] Redesign Tokens and Wallet with prominent balances, quick payment actions, easier funding, and readable activity; signed-in shortcuts, preset selection, invalid-amount feedback and Paystack checkout opening verified. Desktop, phone and tablet widths have no page overflow; 7 existing payment/token tests pass. No payment was completed or balance changed.
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
- [x] Profile editing: customers edit their profile (name, phone, gender, date of birth) on the profile page; browser-verified save and revert.
- [x] Profile pictures: upload/remove on the profile page in a private avatars bucket (signed links); gender-based default avatar verified for male. Female avatar in place; not visually verified with a female account.

## Engagement (fun) features
- [x] Daily spin check-in with streaks and streak bonuses (amounts provisional)
- [x] Levels, badges, "Your usual?" shortcut, referral milestone bar, birthday banner, confetti
- [x] Weekly outlet leaderboards (opt-in, 10 pts/order, 2 pts/check-in)
- [ ] Outlet vs outlet challenges, mystery rewards — need business-approved token budgets
- [ ] Live order tracker and reminder notifications
