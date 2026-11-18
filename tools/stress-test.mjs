/**
 * Stress / load test — gold-pos API.
 *
 * WORKERS parallel promise-based workers hammer read-only endpoints, plus a
 * small write-path burst (temporary QA items, cleaned up via DELETE).
 * Fails on any network error, any non-2xx, any 5xx, or any health non-2xx.
 *
 * Run: npm run test:stress
 * Env: API_BASE_URL, WORKERS (12), REQUESTS_PER_WORKER (40), ROUNDS (2)
 */

import { performance } from 'node:perf_hooks';

const BASE = (process.env.API_BASE_URL || 'http://localhost:4000/api').replace(/\/+$/, '');
const WORKERS = readPositiveInt(process.env.WORKERS, 12);
const REQUESTS_PER_WORKER = readPositiveInt(process.env.REQUESTS_PER_WORKER, 40);
const ROUNDS = readPositiveInt(process.env.ROUNDS, 2);
const COOKIE_NAME = 'gold_session';
const RUN_ID = `QA-STRESS-${Date.now()}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;

const READ_ENDPOINTS = [
  { name: 'health', path: '/health' },
  { name: 'bootstrap', path: '/bootstrap' },
  { name: 'auth-me', path: '/auth/me' },
  { name: 'prices-current', path: '/prices/current' },
  { name: 'prices-table', path: '/prices/table' },
  { name: 'prices-history', path: '/prices/history?pageSize=5' },
  { name: 'items-list', path: '/items?pageSize=20' },
  { name: 'items-next-code', path: '/items/next-code?type=PIECE' },
  { name: 'inventory-summary', path: '/inventory/summary' },
  { name: 'dashboard', path: '/dashboard' },
  { name: 'reports-sales', path: '/reports/sales' },
  { name: 'reports-profit', path: '/reports/profit' },
  { name: 'reports-inventory', path: '/reports/inventory' },
  { name: 'reports-prices', path: '/reports/prices' },
  { name: 'reports-audit', path: '/reports/audit?take=5' },
  { name: 'lookups-all', path: '/lookups' },
  { name: 'lookups-karat', path: '/lookups?kind=KARAT' },
  { name: 'sales-list', path: '/sales?pageSize=20' },
  { name: 'stocktakes-list', path: '/stocktakes' },
  { name: 'settings-get', path: '/settings' },
  { name: 'users-list', path: '/users' },
];

function readPositiveInt(value, fallback) {
  const n = Number.parseInt(String(value ?? ''), 10);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

function errText(err) {
  return `${err?.name ?? 'Error'}: ${err?.message ?? String(err)}`;
}

async function apiFetch(path, { method = 'GET', token, body } = {}) {
  const url = path.startsWith('http') ? path : `${BASE}${path.startsWith('/') ? path : `/${path}`}`;
  const headers = { Accept: 'application/json' };
  if (token) headers.Cookie = `${COOKIE_NAME}=${token}`;
  if (body !== undefined) headers['Content-Type'] = 'application/json';

  const started = performance.now();
  const response = await fetch(url, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
    redirect: 'manual',
  });
  const text = await response.text();
  let payload = null;
  if (text) {
    try {
      payload = JSON.parse(text);
    } catch {
      payload = { raw: text };
    }
  }
  return {
    status: response.status,
    ok: response.ok,
    data: payload?.data,
    error: payload?.error ?? null,
    payload,
    headers: response.headers,
    latencyMs: performance.now() - started,
  };
}

function sessionTokenFrom(headers) {
  let cookies = [];
  if (typeof headers.getSetCookie === 'function') {
    cookies = headers.getSetCookie();
  } else {
    const raw = headers.get('set-cookie');
    cookies = raw ? raw.split(/,(?=\s*[^;,=]+=)/) : [];
  }
  const session = cookies.find((c) => c.trim().startsWith(`${COOKIE_NAME}=`));
  if (!session) return null;
  const value = session.split(';')[0].slice(COOKIE_NAME.length + 1).trim();
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

async function login() {
  const res = await apiFetch('/auth/login', {
    method: 'POST',
    body: { username: 'admin', password: 'Admin@2026' },
  });
  if (!res.ok) {
    throw new Error(`login failed: HTTP ${res.status} ${JSON.stringify(res.error ?? res.payload)}`);
  }
  const token = sessionTokenFrom(res.headers);
  if (!token) throw new Error(`login did not return a ${COOKIE_NAME} cookie`);
  return token;
}

function newMetrics() {
  return {
    requests: 0,
    statusCodes: {},
    byEndpoint: {},
    latencies: [],
    failures: [],
    networkErrors: 0,
    unexpected5xx: 0,
    healthNon2xx: 0,
    writes: { created: 0, deleted: 0, leftovers: [] },
  };
}

function recordFailure(metrics, endpoint, detail) {
  metrics.failures.push({ endpoint, ...detail });
}

function record(metrics, endpoint, res) {
  metrics.requests += 1;
  metrics.statusCodes[String(res.status)] = (metrics.statusCodes[String(res.status)] ?? 0) + 1;
  metrics.byEndpoint[endpoint] ??= { requests: 0, non2xx: 0 };
  metrics.byEndpoint[endpoint].requests += 1;
  metrics.latencies.push(res.latencyMs);

  if (!res.ok) {
    metrics.byEndpoint[endpoint].non2xx += 1;
    if (res.status >= 500) metrics.unexpected5xx += 1;
    if (endpoint === 'health') metrics.healthNon2xx += 1;
    const detail = res.error
      ? `${res.error.code}: ${res.error.message}`
      : JSON.stringify(res.payload)?.slice(0, 300) ?? '(no body)';
    recordFailure(metrics, endpoint, { status: res.status, detail });
  }
}

async function worker(workerId, token, metrics, count) {
  for (let i = 0; i < count; i += 1) {
    const endpoint = READ_ENDPOINTS[(i + workerId) % READ_ENDPOINTS.length];
    try {
      const res = await apiFetch(endpoint.path, { token });
      record(metrics, endpoint.name, res);
    } catch (err) {
      metrics.networkErrors += 1;
      recordFailure(metrics, endpoint.name, { error: errText(err) });
    }
  }
}

async function writeBurst(token, round, metrics) {
  const createdIds = [];
  for (let i = 1; i <= 2; i += 1) {
    const name = `${RUN_ID}-R${round}-W${i}`;
    try {
      const res = await apiFetch('/items', {
        method: 'POST',
        token,
        body: {
          type: 'PIECE',
          name,
          karat: 21,
          totalWeight: 1,
          stoneWeight: 0,
          inlaysWeight: 0,
          quantity: 1,
          purchaseCurrency: 'LYD',
          purchasePrice: 0,
        },
      });
      if (!res.ok) {
        recordFailure(metrics, 'write:POST /items', {
          status: res.status,
          detail: JSON.stringify(res.error ?? res.payload)?.slice(0, 300),
        });
        continue;
      }
      createdIds.push(res.data.id);
      metrics.writes.created += 1;
    } catch (err) {
      recordFailure(metrics, 'write:POST /items', { error: errText(err) });
    }
  }

  for (const id of createdIds) {
    try {
      const res = await apiFetch(`/items/${id}`, { method: 'DELETE', token });
      if (!res.ok) {
        metrics.writes.leftovers.push(`item #${id}: HTTP ${res.status}`);
        recordFailure(metrics, 'write:DELETE /items/:id', {
          status: res.status,
          detail: JSON.stringify(res.error ?? res.payload)?.slice(0, 300),
        });
      } else {
        metrics.writes.deleted += 1;
      }
    } catch (err) {
      metrics.writes.leftovers.push(`item #${id}: ${errText(err)}`);
      recordFailure(metrics, 'write:DELETE /items/:id', { error: errText(err) });
    }
  }
}

function percentile(sorted, fraction) {
  if (sorted.length === 0) return 0;
  const index = Math.min(sorted.length - 1, Math.max(0, Math.ceil(fraction * sorted.length) - 1));
  return Math.round(sorted[index] * 100) / 100;
}

function summarize(metrics) {
  const sorted = [...metrics.latencies].sort((a, b) => a - b);
  const avg =
    sorted.length === 0 ? 0 : Math.round((sorted.reduce((sum, value) => sum + value, 0) / sorted.length) * 100) / 100;
  return {
    config: {
      apiBaseUrl: BASE,
      workers: WORKERS,
      requestsPerWorker: REQUESTS_PER_WORKER,
      rounds: ROUNDS,
      runId: RUN_ID,
    },
    requests: metrics.requests,
    statusCodes: metrics.statusCodes,
    latencyMs: {
      min: sorted.length === 0 ? 0 : Math.round(sorted[0] * 100) / 100,
      avg,
      max: sorted.length === 0 ? 0 : Math.round(sorted[sorted.length - 1] * 100) / 100,
      p95: percentile(sorted, 0.95),
    },
    errors: metrics.failures.length,
    networkErrors: metrics.networkErrors,
    unexpected5xx: metrics.unexpected5xx,
    healthNon2xx: metrics.healthNon2xx,
    writes: {
      created: metrics.writes.created,
      deleted: metrics.writes.deleted,
      leftovers: metrics.writes.leftovers,
    },
    byEndpoint: metrics.byEndpoint,
    failures: metrics.failures.slice(0, 50),
    result: metrics.failures.length === 0 ? 'PASS' : 'FAIL',
  };
}

async function main() {
  console.log(`Stress test | ${BASE} | workers=${WORKERS} requests/worker=${REQUESTS_PER_WORKER} rounds=${ROUNDS}`);
  const metrics = newMetrics();

  for (let round = 1; round <= ROUNDS; round += 1) {
    let token;
    try {
      token = await login();
    } catch (err) {
      recordFailure(metrics, `round ${round}:login`, { error: errText(err) });
      continue;
    }

    const workers = Array.from({ length: WORKERS }, (_, id) => worker(id, token, metrics, REQUESTS_PER_WORKER));
    await Promise.all(workers);
    await writeBurst(token, round, metrics);
  }

  const summary = summarize(metrics);
  console.log(JSON.stringify(summary, null, 2));
  if (summary.result !== 'PASS') process.exitCode = 1;
}

main().catch((err) => {
  console.error(`FATAL: ${errText(err)}`);
  process.exitCode = 1;
});
