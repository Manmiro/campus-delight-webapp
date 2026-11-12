# Security remediation — 12 November 2026

The owner authorized the tested database fixes for production. The production
database was updated and its function privileges, active-account checks,
subscription privileges, staff policies and upload types were read back.

## Corrected boundaries

- Wallet refunds and referral reward helpers are service-only. Trusted checkout
  and cancellation functions retain access; browsers cannot mint funds or rewards.
- Outlet financial reads require assigned staff membership. Customers cannot
  read other customers' loans or subscriptions at the same outlet.
- Subscription terms cannot be updated by a browser. Payment preparation stores
  a plan/price/outlet snapshot; settlement checks it and credits mismatched paid
  funds to the wallet once, preserving historical callbacks and debt repayment.
- Frozen accounts are blocked inside financial/admin database functions and
  direct table/storage policies. Frozen headquarters accounts cannot unfreeze
  themselves. Token transfers serialize before checking the daily limit.
- Legacy ordering delegates to the capped fulfillment checkout. Co-pay, delivery,
  entitlement use and cancellation remain atomic. Wallet ledger entries are
  appended with the final order ID rather than updated afterward.
- Public gift endpoints use service-only, persistent request budgets keyed by a
  secret HMAC of the trusted client address. Raw request bodies are bounded before
  deserialization. Responses set browser security and private-response headers.
- Upload MIME allowlists are enforced in storage and the UI; dashboard uploads
  require assigned staff or headquarters access.
- The lockfile was regenerated against the official npm registry and verified
  with `bun install --frozen-lockfile --ignore-scripts` using Bun 1.4.4. No checksum
  verification was disabled. Vulnerable dependency versions were upgraded.

## Database application

For a new database, apply the migration journal first, then
`drizzle/proposed/meal_plan_caps.sql`,
`drizzle/proposed/security_privilege_hotfix.sql` and
`drizzle/proposed/security_boundaries.sql`, in that order. The meal-cap script is
applied once. The security boundary script must follow any replacement of the
checkout functions so active-account guards and function grants remain intact.
These files remain outside the migration journal to avoid replaying an already
applied production change automatically.

The meal-cap rollout preserves existing positive hosted caps. Older clients
without the new quote parameter still pay the authoritative current cap;
explicit stale quotes are rejected. Existing order snapshots are not rewritten.

## Verification and limits

Regression coverage loads the complete migration journal into PostgreSQL via
PGlite and exercises anonymous/customer/staff/headquarters/service roles, the
reported attacks, successful payments, replayed settlement, legacy orders,
cancellation, insufficient balances and request limits. Request tests preserve
signed webhook bytes and reject oversized streaming bodies.

The exact-version OSV scan checked 684 locked package versions. Its sole remaining
match was `deepmerge@4.3.1` / `GHSA-gcqx-w48m-w2h4`, for which the audit found no
upstream fixed release. `patches/deepmerge@4.3.1.patch` is applied by Bun and blocks
prototype keys from both merge inputs; tests cover null-prototype inputs and
normal email-rendering merges. Version-only scanners will continue reporting
this match until upstream ships a fixed version. Do not remove the patch or use
a package manager that ignores `patchedDependencies`.

An audit and regression suite cannot guarantee the absence of other
vulnerabilities. Live verification used metadata and read-only checks; exploit
reproduction and synthetic financial mutations were confined to the local test
database.
