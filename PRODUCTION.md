# Production changes

What I would change before real neighbours use LendLoop, roughly in priority order.

## Secrets

- Move secrets to a secret manager, and inject them at deploy time.
- Use one HMAC secret per direction, and rotate them. During rotation, accept the old and new secret for a short overlap.
- Add the HTTP method and path to the signed text, and a short-lived nonce store to reject replays inside the window.
- Back up `N8N_ENCRYPTION_KEY` separately from the database. Without it, stored credentials can't be read.

## n8n

- Run queue mode with Postgres and Redis, because the default SQLite and single process don't scale or fail over.
- Run Code nodes on external task runners (the `n8nio/runners` image). Internal mode is deprecated and shares the n8n process's user.
- Remove `$env` access from workflows. Options are signing in a custom node that reads an n8n credential, or a small signing service. Then set `N8N_BLOCK_ENV_ACCESS_IN_NODE=true`.
- Put HTTPS and a reverse proxy in front, restrict the editor to a VPN or SSO, and expose only the webhook path.
- Keep workflows in version control, and promote them through staging with the CLI.
- Save only failed executions, so successful payloads with email addresses aren't stored at all.

## Email

- Use a real provider with a verified domain (SPF, DKIM, DMARC).
- Pass `eventId` as the provider's idempotency key, so retries can't send duplicates.
- Handle bounces and complaints through provider webhooks, and stop sending to addresses that bounce.
- Add unsubscribe preferences for anything that isn't essential.

## HTTP endpoints

- Rate limit the n8n endpoints, for example with the Convex rate limiter component, and put per-IP limits at the edge if a proxy is available.
- Rate limit `loans.request` and `tools.create` per user, to stop spam listings and requests.

## Users and data

- Use Clerk webhooks (signed with Svix) to sync profile changes and deletions, rather than only updating on sign-in.
- On account deletion, anonymize the user while keeping loan records the other party still needs.
- Define retention: purge automation events after 90 days, and soft-deleted tools and old loans after an agreed period.
- Write a privacy notice, and support data export requests.

## Audit log

- Record admin actions (role changes, listing removals, Trusted Lender changes) in an append-only table: who, what, when.
- Make role changes require a second admin.

## Monitoring and alerting

- Send frontend and Convex errors to Sentry.
- Stream Convex logs to a log platform with Convex log streams.
- Alert on `failed` automation events instead of relying on someone opening `/admin`.
- Add a dead-man's switch: alert if the daily overdue workflow hasn't run, since a schedule that never fires produces no error.
- Add a retry button for failed notifications, and a scheduled sweep for sends lost to a crashed action.

## Scale and reliability

- Add cursor pagination to every list, and store availability on the tool instead of reading loans per tool.
- Paginate the overdue endpoint, which currently stops at 200 loans.
- Store a timezone per neighbourhood, so "today" and "overdue" match what people expect.
- Add Playwright tests for the main flows, and run all checks in CI, including `npm run check:secrets`.

## Backups

- Schedule Convex backups, and back up the n8n database and volume.
- Test a restore regularly, because an untested backup isn't a backup.

## Deployment

- Use a production Clerk instance and Convex production deployment (`npx convex deploy`), each with its own environment variables.
- Pin dependency versions, enable automated security updates, and upgrade the pinned n8n image deliberately.
