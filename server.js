'use strict';
// ledgerly — a small invoice/ledger API for managed-dependency QA.
// This branch intentionally scopes the config contract to Postgres + Redis so
// deployment benchmarks measure platform-managed app/database/cache wiring,
// not user-owned SaaS secret entry.
// On any misconfig it prints ONE clear line naming the culprit, then exits 1.
// This is deliberately strict so a single wrong/missing var crash-loops the
// container the way real apps do.

const http = require('http');
const { Client } = require('pg');
const Redis = require('ioredis');

// ---- config contract -------------------------------------------------------
// kind: 'required' | 'url' | 'int' | 'enum' | 'prefix' | 'optional'
const SPEC = [
  { key: 'DATABASE_URL',     kind: 'required' },
  { key: 'REDIS_URL',        kind: 'required' },
];

function validateConfig() {
  const cfg = {};
  const errors = [];
  for (const s of SPEC) {
    let v = process.env[s.key];
    if ((v === undefined || v === '') && s.def !== undefined) v = s.def;
    const missing = v === undefined || v === '';
    switch (s.kind) {
      case 'required':
        if (missing) errors.push(`missing required env: ${s.key}`);
        break;
      case 'optional':
        break;
      case 'minlen':
        if (missing) errors.push(`missing required env: ${s.key}`);
        else if (v.length < s.min) errors.push(`${s.key} must be at least ${s.min} chars`);
        break;
      case 'url':
        if (missing) errors.push(`missing required env: ${s.key}`);
        else if (!/^https?:\/\//.test(v)) errors.push(`${s.key} must be a URL (http(s)://...), got "${v}"`);
        break;
      case 'int':
        if (missing) errors.push(`missing required env: ${s.key}`);
        else if (!/^\d+$/.test(v)) errors.push(`${s.key} must be an integer, got "${v}"`);
        break;
      case 'enum':
        if (missing) errors.push(`missing required env: ${s.key}`);
        else if (!s.values.includes(v)) errors.push(`${s.key} must be one of [${s.values.join(', ')}], got "${v}"`);
        break;
      case 'prefix':
        if (missing) errors.push(`missing required env: ${s.key}`);
        else if (!v.startsWith(s.prefix)) errors.push(`${s.key} must start with "${s.prefix}", got "${v.slice(0, 6)}..."`);
        break;
    }
    cfg[s.key] = v;
  }
  if (errors.length) {
    for (const e of errors) console.error(`[config] FATAL: ${e}`);
    console.error(`[config] ${errors.length} configuration error(s); refusing to start.`);
    process.exit(1);
  }
  return cfg;
}

async function main() {
  const cfg = validateConfig();
  const logLevel = process.env.LOG_LEVEL || 'info';
  console.log(`[boot] managed-deps config OK (${SPEC.length} vars checked), log_level=${logLevel}`);

  // ---- Postgres ----
  const pg = new Client({ connectionString: cfg.DATABASE_URL, connectionTimeoutMillis: 5000 });
  try {
    await pg.connect();
    await pg.query(`CREATE TABLE IF NOT EXISTS invoices (
      id SERIAL PRIMARY KEY, amount_cents INT NOT NULL, memo TEXT, created_at TIMESTAMPTZ DEFAULT now())`);
  } catch (err) {
    const where = (() => { try { const u = new URL(cfg.DATABASE_URL); return `${u.hostname}:${u.port || 5432}`; } catch { return cfg.DATABASE_URL; } })();
    console.error(`[db] FATAL: cannot connect to Postgres at ${where}: ${err.message}`);
    process.exit(1);
  }

  // ---- Redis ----
  const redis = new Redis(cfg.REDIS_URL, { connectTimeout: 5000, maxRetriesPerRequest: 1, lazyConnect: true });
  try {
    await redis.connect();
    await redis.ping();
  } catch (err) {
    const where = (() => { try { const u = new URL(cfg.REDIS_URL); return `${u.hostname}:${u.port || 6379}`; } catch { return cfg.REDIS_URL; } })();
    console.error(`[redis] FATAL: cannot connect to Redis at ${where}: ${err.message}`);
    process.exit(1);
  }

  const port = parseInt(process.env.PORT || '3000', 10);
  const server = http.createServer(async (req, res) => {
    try {
      if (req.url === '/health') {
        await pg.query('SELECT 1'); await redis.ping();
        res.writeHead(200, { 'content-type': 'application/json' });
        return res.end(JSON.stringify({ status: 'ok' }));
      }
      if (req.url === '/' ) {
        res.writeHead(200, { 'content-type': 'text/html' });
        return res.end('<h1>ledgerly</h1><p>POST /api/invoices {"amount_cents":N,"memo":"..."} ; GET /api/invoices</p><p>build: D3CLEAN-d3clean-134232-4a77</p>');
      }
      if (req.url === '/api/invoices' && req.method === 'GET') {
        const hits = await redis.incr('invoices:list:hits');
        const { rows } = await pg.query('SELECT id, amount_cents, memo, created_at FROM invoices ORDER BY id DESC LIMIT 20');
        res.writeHead(200, { 'content-type': 'application/json' });
        return res.end(JSON.stringify({ hits, invoices: rows }));
      }
      if (req.url === '/api/invoices' && req.method === 'POST') {
        let body = ''; for await (const c of req) body += c;
        const { amount_cents, memo } = JSON.parse(body || '{}');
        const { rows } = await pg.query('INSERT INTO invoices (amount_cents, memo) VALUES ($1, $2) RETURNING id', [amount_cents | 0, memo || null]);
        res.writeHead(201, { 'content-type': 'application/json' });
        return res.end(JSON.stringify({ id: rows[0].id }));
      }
      res.writeHead(404, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ error: 'not_found' }));
    } catch (err) {
      res.writeHead(500, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ error: err.message }));
    }
  });
  server.listen(port, () => console.log(`ledgerly listening on ${port}`));
}

main().catch((err) => { console.error(`[fatal] ${err && err.stack || err}`); process.exit(1); });
