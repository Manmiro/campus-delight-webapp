# Meal plan caps rollout

The application changes require `meal_plan_caps.sql`. This SQL is proposed and
has not been applied to a hosted database or added to the migration journal.

After database approval, apply the SQL as one transaction against the current
schema (through migration 0049), then deploy the matching application. Record
the approved change in the team's migration process before the next automated
migration. Do not deploy the new application against a database missing these
columns and RPC signatures.

Existing and new outlets start at **₦2,000 per meal**. HQ can change each outlet's
cap independently. Values are stored in integer kobo. Authenticated users may
read the cap; only the HQ-authenticated update RPC can change it through the app.
Each changed cap creates a `set_meal_cap` audit entry with the authenticated UID,
outlet ID, previous cap, and new cap in the same transaction as the outlet update.

Checkout reads and locks the authoritative menu prices, outlet cap, entitlement,
and wallet. It rejects a changed cap quote before any debit. The old pickup RPC
delegates to the same checkout. Older subscription clients must refresh to send
the cap quote. Cash, token, and Pay Later checkout continue to use their existing
account rules; existing overdue restriction triggers remain in place.

Orders store the cap, food coverage, co-pay, and total wallet debit at purchase.
Cancellation restores the entitlement and refunds the original co-pay plus
delivery once, even if HQ later changes the cap. Historical subscription orders
retain their existing delivery-only refund behavior.

Verification after applying the approved SQL:

1. In `/admin/operations`, change a cap and verify its actor and previous/new
   values in `public.audit_logs`. Confirm unchanged or invalid values cannot save.
2. In `/admin/outlets`, check the cap column and save contact/address details with
   a cap change. Confirm a manager/customer cannot call the update RPC.
3. With a ₦2,000 cap, confirm ₦1,500 and ₦2,000 food consume one meal and debit
   only delivery; pickup debits zero. ₦2,600 food debits ₦600 for pickup and ₦1,200
   with ₦600 delivery. Confirm the receipt and wallet ledger match.
4. With a ₦1,199.99 wallet, reject the ₦1,200 checkout with the required top-up
   message and confirm neither the wallet nor entitlement changes.
5. Change the cap while checkout is open and verify re-confirmation is required.
6. Cancel both delivery and pickup co-pay orders. Confirm the full original
   wallet debit is refunded and exactly one meal is restored; repeat cancellation
   must not issue another refund.

Local automated coverage is in `src/test/meal-cap-*.test.*` and the transaction
email tests. `bun.lock` retains the mirrored `uri-js@4.4.1` URL with the SHA-512
verified against both that archive and the official npm archive.
