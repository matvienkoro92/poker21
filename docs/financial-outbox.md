# Financial notification outbox

Completed requisite payments and requisite-to-main balance transfers persist an immutable event in the same Redis Lua operation as their balance mutations. Existing historical operations are not replayed. Manual balance commands and intermediate payment statuses are outside this queue.

Keys use `poker21:financial-outbox:`. The `due` sorted set schedules events; each event keeps per-recipient `sent:N` Telegram message IDs, delivery timestamp, attempt count and last error. Delivered events and receipts are retained for audit. A 120-second token-owned lease protects each event from concurrent workers; worker execution is bounded below the lease duration.

Delivery runs immediately after a transaction, opportunistically on authenticated bot updates, and daily through Vercel cron (`/api/financial-notifications`). The endpoint accepts a bearer `CRON_SECRET` (or webhook secret when no cron secret exists). It can also be called by a more frequent external scheduler. Retry eligibility backs off up to an hour and respects Telegram retry_after; actual retry timing depends on worker invocations. With no bot traffic, the daily cron is the fallback, not a minute-level delivery guarantee. Verify CRON_SECRET is configured in production and that the cron deployment succeeds.

Telegram sendMessage has no idempotency key. If Telegram accepts a message but its response is lost, or saving the delivery receipt fails, a later retry can duplicate that message. Retrying is preferred to silently losing a financial notification. Repeated confirmed events, concurrent workers and acknowledged deliveries are deduplicated. Owner confirmations edit the original message; a definitively missing/uneditable message falls back to a new message.

Tests: `node --test tests/financial-outbox.test.js tests/requisite-balances.test.js`.
