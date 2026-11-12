Proposed database changes that have NOT been applied. They are kept out of
drizzle/migrations so the migrator does not run them until the business approves.

- `feed_someone.sql`: public guest gifting. See `feed_someone.md` for the pending
  business rules, required server configuration, and rollout verification.

- `meal_plan_caps.sql`: HQ outlet meal caps and atomic subscription co-pay checkout.
  See `meal_plan_caps.md` for deployment order and verification.
