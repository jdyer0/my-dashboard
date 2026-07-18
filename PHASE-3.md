# Phase 3 — finances

Paste this into Claude Code once Phase 2 is working and you've logged real meals for a few
days.

BEFORE STARTING, do these yourself (Claude Code can't):
1. Register at enablebanking.com (free), create an application, and generate the RSA
   keypair per their docs. Activate "restricted production" by whitelisting your own bank
   account(s).
2. Confirm your bank is on their supported list. (If you bank with Monzo or Starling,
   stop and tell Claude Code — both have personal-use APIs that are far simpler, and the
   prompt below should be adapted rather than followed.)
3. Have the application ID and the private key PEM ready to store as Supabase secrets.

---

Read `CLAUDE.md` first — especially §7's Enable Banking notes, which override anything you
think you know about this API. Phases 0–2 are done. Build Phase 3 — finances — and nothing
else.

The goal: balances and spending visible on the dashboard without me ever manually entering
a transaction. Spending + balances only — no budgets, no net worth, no investments.

## Architecture — the security shape is non-negotiable

Everything that touches Enable Banking lives in Supabase Edge Functions. The client never
sees the application ID, the private key, or any Enable Banking URL. Client talks only to
our own Edge Functions with the user's Supabase JWT.

Secrets (set via `supabase secrets set`, listed in a comment in the function, never in any
committed file):
- `EB_APP_ID`
- `EB_PRIVATE_KEY` (PEM)

Edge Functions:
- **`bank-connect`** — starts authorisation: builds the Enable Banking JWT (RS256, signed
  with the private key, TTL well under the 24h max — generate per request), calls their
  auth endpoint, returns the bank's redirect URL for the client to open. Handles the
  callback: exchanges the code for a session, stores session + account identifiers.
- **`bank-sync`** — fetches transactions and balances for all connected accounts. Callable
  two ways: by Supabase Cron (nightly, no PSU headers) and by the client (manual refresh,
  WITH psu headers since the user genuinely triggered it — this distinction is how the
  rate-limit rules work, don't blur it).
- The nightly cron: schedule via Supabase Cron calling `bank-sync` at 05:30 UTC.

## Schema

Migration `0004_finance.sql`. RLS on everything.

**`bank_connections`**
`id`, `user_id`, `session_id`, `bank_name`, `status` (check: `active|expired|revoked`),
`consent_expires_at` timestamptz, `created_at`.

**`bank_accounts`**
`id`, `user_id`, `connection_id`, `identification_hash` — the STABLE cross-session key,
unique per user — `account_uid` (the session-scoped id, refreshed on re-auth), `name`,
`currency`, `created_at`.
Never key anything durable on `account_uid`. CLAUDE.md §7 explains why.

**`balances`**
`id`, `account_id`, `amount_minor` integer (pence — CLAUDE.md §6), `balance_type`,
`recorded_at`. Append-only; the dashboard reads the latest per account, and the history is
free balance-over-time data.

**`transactions`**
`id`, `user_id`, `account_id`, `entry_reference`, `amount_minor` integer (signed: negative
= money out), `currency`, `booking_date` date, `value_date` date nullable, `description`,
`merchant` nullable, `status` (check: `booked|pending`), `category` nullable,
`raw` jsonb (keep the full original — recategorisation and debugging need it),
`created_at`.
Unique on `(account_id, entry_reference)` where entry_reference is not null. Upsert on
conflict. Pending transactions are stored but excluded from spend totals and from dedupe
matching until booked.

**`category_rules`**
`id`, `user_id`, `pattern` (matched case-insensitively against description/merchant),
`category`, `created_at`.

## Sync logic — the traps are all in CLAUDE.md §7, honour every one

- **First sync after connecting**: `strategy=longest`, paginate on `continuation_key` until
  it returns null. An empty page with a non-null key means CONTINUE. This is the one shot
  at full history — it's typically only available in the first hour after authorisation.
- **Nightly sync**: fetch from 7 days before the last known booking_date (overlap is
  handled by the upsert; late-booking transactions are why the window exists).
- On `ASPSP_RATE_LIMIT_EXCEEDED`: stop, record it, let the next cron pick up. No retry
  loops.
- On 401 `EXPIRED_SESSION`: mark the connection `expired`, surface the reconnect state in
  the UI. Don't retry.
- Log each sync run to a `sync_runs` table (`started_at`, `finished_at`, `accounts_synced`,
  `transactions_upserted`, `error` nullable) — when a sync silently fails I want to see it
  in-app, not discover stale data a week later.

## Categorisation

Rules-based, no ML, no external service:
- Seed ~20 sensible default patterns (TESCO→groceries, TFL→transport, NETFLIX→
  subscriptions, etc.)
- Applying a category to a transaction offers "always categorise matches like this" which
  writes a `category_rules` row and back-applies it to existing uncategorised matches
- Uncategorised is a visible state to work through, not a hidden failure

Categories (text + check constraint): `groceries`, `eating_out`, `transport`, `bills`,
`subscriptions`, `shopping`, `health`, `cash`, `income`, `transfers`, `other`.
`transfers` (between own accounts) are excluded from spend totals — moving money isn't
spending. Match opposing amounts on the same day across own accounts and auto-categorise
as transfers.

## Screens

**Money tab (index)**
- Total balance across accounts, primary metric, `<CountUp>`
- Per-account rows: name, balance, a `<SyncDot>` reflecting that account's sync state
- This month's spend vs last month at the same point in the month (comparing 12 days into
  July against all of June is meaningless — compare like for like)
- Spend by category, top 5 as `<Bar>`s
- Recent transactions, tap to categorise
- Manual refresh triggers `bank-sync` with PSU headers
- If consent expires within 14 days: a quiet `warn` banner with a reconnect action. If
  expired: the banner is the screen's primary state.

**Transactions screen** — full list, month-grouped, filter by account and category, running
uncategorised count at the top.

**Connect flow** — "Connect a bank" → Edge Function returns the bank auth URL → open it →
on return, show the accounts found and confirm. First sync runs immediately after (that
one-hour history window).

**Overview tile** — spend this week + total balance. `warn` state if the last successful
sync is >48h old.

## Constraints

- Money is integer pence everywhere. If a float touches a monetary value anywhere in the
  pipeline, that's a bug.
- No budgets, no goals, no net-worth, no CSV import, no Plaid/TrueLayer fallback. Ask
  before adding anything.
- Unit-test: dedupe logic, transfer matching, the like-for-like month comparison, category
  rule matching.
- Don't deploy the client. Edge Functions deploy via `supabase functions deploy` — that's
  fine and necessary; tell me the commands rather than assuming I ran them.

## When you're done

Give me, in order: the secrets to set and the exact `supabase secrets set` commands, the
function deploy commands, the cron setup, and the migration command. Confirm tests pass.
Update the status table in `CLAUDE.md` and stop.
