# ledgerly

A small invoice/ledger API used as an OpenLander deploy test fixture.

This branch is the **managed-deps-only** fixture: it intentionally requires only
the dependencies that a deployment platform can provision and wire itself
(**Postgres + Redis**). It is meant for Day-1 composite-deploy benchmarking where
the target question is whether an agent can deploy an app with managed database
and cache through the platform's native workflow.

The `main` branch keeps the full app-secret / external-SaaS contract. Use that
branch when testing honest blocking on missing user-owned external config. Use
this branch when testing app + Postgres + Redis lifecycle without external SaaS
confounds.

## Backing services
- **Postgres** — `DATABASE_URL` (creates an `invoices` table on boot)
- **Redis** — `REDIS_URL` (request counter)

## Environment contract
| var | rule |
|---|---|
| `DATABASE_URL` | required |
| `REDIS_URL` | required |
| `PORT` | integer (default 3000) |
| `LOG_LEVEL` | one of debug/info/warn/error (default info) |

## Endpoints
- `GET /health` — checks Postgres + Redis, returns `{status:"ok"}`
- `GET /` — info page
- `GET /api/invoices` — list (Redis-counted, Postgres-read)
- `POST /api/invoices` `{amount_cents, memo}` — create (Postgres-write)

## Failure modes (for testing agent diagnosis/recovery)
- **Missing/invalid env** → `[config] FATAL: …` naming the var, exit 1.
- **Postgres unreachable** → `[db] FATAL: cannot connect to Postgres at host:port: …`, exit 1.
- **Redis unreachable** → `[redis] FATAL: cannot connect to Redis at host:port: …`, exit 1.

Boot order: config → Postgres → Redis → listen. The first failing layer names
itself and exits, so a single bad var/dep crash-loops the container.

# d3 same-branch update marker 17081f4

# d3-sonnet marker 1780587570
