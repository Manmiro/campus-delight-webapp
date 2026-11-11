# Feed Someone rollout (pending business approval)

The public `/feed-someone` page and landing-page gift button are implemented.
The SQL in `feed_someone.sql` is deliberately outside the migration journal.
Do not enable live checkout until the business approves these rules and the SQL
has been applied through the project's normal database release process.

Business rules represented by the implementation:

- Wallet gifts use normal wallet funding, including automatic Pay Later repayment.
- Weekend gifts cover the next Friday–Sunday, including today if it is Friday.
- Weekly gifts cover seven days starting on successful payment.
- Monthly gifts cover payment day through the last day of that Lagos calendar
  month at the displayed outlet price. This is not a prorated price.
- Plan and meal prices and meal delivery fees are snapshotted at checkout.
  Subsequent price edits do not change a payment already in progress.
- Gift meal orders enter the existing kitchen queue only after verified payment.
  They use the existing card-order cancellation/refund path and a `CDG-` reference
  that the kitchen displays as **Surprise Gift**.
- If the recipient changes outlet, the outlet or recipient becomes inactive, a
  meal sells out, or an existing order restriction rejects fulfillment while
  payment is in progress, the whole payment goes to the recipient's wallet once.
  Both confirmation emails explain the fallback. No debt restriction is waived.
- Each gift has independent student/sponsor email claims. A failed email leaves
  settlement committed; signed Paystack webhook retries or receipt refreshes
  retry delivery. No queue or standalone email endpoint is created.

Deployment configuration:

- Existing server secrets: `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`,
  `PAYSTACK_SECRET_KEY`, and `PINGRAM_API_KEY`.
- Lookup and checkout accept validated gift details directly, with no browser
  challenge or expiring verification token. Keep hosted Supabase Auth CAPTCHA
  protection disabled for the account forms as documented in the README.
- Set `LOVABLE_APP_ORIGIN` for an additional canonical deployed origin if needed.
- Keep Paystack's signed webhook pointed to `/api/public/paystack/webhook`.
  The existing webhook dispatches `CDG-` references to gift settlement while
  preserving historical wallet, subscription and order settlement.

After approval, apply the SQL, refresh generated Supabase types, and complete a
Paystack test-mode round trip for each gift type on the deployed test hostname.
Verify the student's ledger/entitlements/order, the kitchen tag, both email
receipts, delivery and pickup totals, and repeated webhook/return-page requests.
Do not use live student accounts or live charges for rollout verification.

Public lookup reveals only a first name and surname initial, assigned active
outlet, gender-based default or short-lived signed profile photo, and live
catalogue prices. Sponsor email, note, addresses and payment payloads remain
service-only in `gift_payments`; the random receipt reference returns fulfillment
status only. These records are separate from existing `payment_transactions`.
