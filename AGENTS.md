<!-- LOVABLE:BEGIN -->
> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.
<!-- LOVABLE:END -->

- Keep customer sign-in credential validation and confirmed-email checks in `src/lib/auth-rules.ts` with focused tests so the account-entry rules stay consistent.
- Allocate profile customer/referral codes in a database trigger with serialized collision checks and format constraints; every creation path uses it and manager reassignment preserves codes.
- Keep shared dashboard sizing and navigation in AppShell and shared summary components; constrain text tracks and scroll wide tables locally so every role works on small screens.
- Keep Paystack network and privileged settlement helpers in `*.server.ts`, dynamically loaded inside server-function handlers; use atomic, service-only settlement so redirects and retries cannot double-credit. Preserve historical payment settlement when retiring a checkout method.
- Keep Privacy and Terms as separate public routes with a shared legal-page layout; unfinished policy drafts must be visibly distinguished from approved effective policies.
- Deliver verification SMS through a dynamically imported server-only helper; issue codes through a service-only RPC, bind them to the profile phone, never disclose codes to browsers, and persist failed attempts by returning false rather than raising after an update.
- Transaction receipts use app-owned React Email templates and synchronous managed delivery from authorized feature handlers after successful mutations; derive recipients and receipt facts from committed records and deduplicate by event ID, never create email queues/tables or browser-controlled send endpoints.

- Keep all six authentication email actions on the scaffolded managed handler and share an app-owned React Email layout so branding stays consistent without altering secure callback semantics.
- Fulfillment checkout uses an atomic database RPC that snapshots outlet delivery fees, validates the quoted fee and charges the chosen account; subscription meals charge delivery to the wallet with cancellation refunds. Outlet fee edits use an audited manager-scoped RPC to prevent cross-outlet changes.
