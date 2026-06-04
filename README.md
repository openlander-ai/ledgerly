# ledgerly

A small invoice/ledger API used as a **realistic-complexity** deploy test fixture:
two backing services (**Postgres + Redis**) and **18 environment variables** with
required / format-validated / optional semantics. On any misconfiguration it logs
**one clear line naming the offending variable** and exits 1 (so a single wrong var
crash-loops the container the way real apps do).

## Backing services
- **Postgres** — `DATABASE_URL` (creates an `invoices` table on boot)
- **Redis** — `REDIS_URL` (request counter)
- **External HTTP API** — `EXCHANGE_API_URL` (+ `EXCHANGE_API_KEY`); boot preflight
  confirms it is *reachable* (the platform can't provision this for you)

## Environment contract (18 vars)
| var | rule |
|---|---|
| `DATABASE_URL` | required |
| `REDIS_URL` | required |
| `JWT_SECRET` | required, ≥16 chars |
| `SESSION_SECRET` | required, ≥16 chars |
| `APP_BASE_URL` | required, must be `http(s)://…` |
| `PORT` | integer (default 3000) |
| `LOG_LEVEL` | one of debug/info/warn/error (default info) |
| `RATE_LIMIT_MAX` | integer (default 100) |
| `STRIPE_API_KEY` | required, must start with `sk_` |
| `SMTP_HOST` | required |
| `SMTP_PORT` | integer |
| `SMTP_USER` | required |
| `SMTP_PASS` | required |
| `S3_BUCKET` | required |
| `S3_REGION` | required |
| `S3_ACCESS_KEY` | required |
| `S3_SECRET_KEY` | required |
| `EXCHANGE_API_URL` | required, must be `http(s)://…` (external API, preflighted on boot) |
| `EXCHANGE_API_KEY` | required, must start with `key_` |
| `CORS_ORIGINS` | optional (default `*`) |

## Endpoints
- `GET /health` — checks Postgres + Redis, returns `{status:"ok"}`
- `GET /` — info page
- `GET /api/invoices` — list (Redis-counted, Postgres-read)
- `POST /api/invoices` `{amount_cents, memo}` — create (Postgres-write)

## Failure modes (for testing agent diagnosis/recovery)
- **Missing/invalid env** → `[config] FATAL: …` naming the var, exit 1.
- **Postgres unreachable** → `[db] FATAL: cannot connect to Postgres at host:port: …`, exit 1.
- **Redis unreachable** → `[redis] FATAL: cannot connect to Redis at host:port: …`, exit 1.
- **External API unreachable** → `[extapi] FATAL: cannot reach external API at host: …`, exit 1
  (egress blocked / wrong URL — the dependency the platform can't provision).

Boot order: config → Postgres → Redis → external-API preflight → listen. The first
failing layer names itself and exits, so a single bad var/dep crash-loops the container.

# d3 same-branch update marker 17081f4

# d3-sonnet marker 1780587570
