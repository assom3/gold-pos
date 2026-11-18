/**
 * Full API integration test — gold-pos.
 *
 * Covers every route exposed by apps/api/src/app.ts plus the new fixedBasis /
 * cost-profit behaviour. Runs ROUNDS rounds (default 2), logs in as OWNER and
 * SELLER each round, asserts everything and exits non-zero on any failure.
 *
 * Run: npm run test:integration
 * Env: API_BASE_URL (default http://localhost:4000/api), ROUNDS (default 2)
 *
 * NOTE: the real API wraps successes as { data: ... } (see lib/http.ts),
 * and authenticates with the httpOnly cookie `gold_session` (see auth/session.ts).
 */

import { performance } from 'node:perf_hooks';

const BASE = (process.env.API_BASE_URL || 'http://localhost:4000/api').replace(/\/+$/, '');
const ROUNDS = readPositiveInt(process.env.ROUNDS, 2);
const COOKIE_NAME = 'gold_session';
const CREDENTIALS = {
  owner: { username: 'admin', password: 'Admin@2026' },
  seller: { username: 'seller', password: 'Seller@2026' },
};
const RUN_ID = `QA-${Date.now()}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;

const totals = { passed: 0, failed: 0, notes: 0 };
let qaFxRate = 1350;

// ───────────────────────────── utilities ─────────────────────────────

function readPositiveInt(value, fallback) {
  const n = Number.parseInt(String(value ?? ''), 10);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

class QaError extends Error {}

function fail(message) {
  throw new QaError(`فشل التحقق | ASSERTION FAILED: ${message}`);
}

function assert(condition, message) {
  if (!condition) fail(message);
}

function equal(actual, expected, label) {
  if (!Object.is(actual, expected)) {
    fail(
      `${label}: expected ${JSON.stringify(expected)} but got ${JSON.stringify(actual)}` +
        ` | القيمة المتوقعة ${JSON.stringify(expected)} والفعلية ${JSON.stringify(actual)}`,
    );
  }
}

function errText(err) {
  if (err instanceof QaError) return err.message;
  return `${err?.name ?? 'Error'}: ${err?.message ?? String(err)}`;
}

const isObject = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const isNumber = (v) => typeof v === 'number' && Number.isFinite(v);

class CheckLog {
  constructor(label) {
    this.label = label;
    this.passed = 0;
    this.failed = 0;
    this.notes = [];
  }

  async check(name, fn) {
    try {
      const value = await fn();
      this.passed += 1;
      console.log(`  ✓ ${name}`);
      return value;
    } catch (err) {
      this.failed += 1;
      console.error(`  ✗ ${name}\n      ${errText(err)}`);
      return undefined;
    }
  }

  note(text) {
    this.notes.push(text);
    console.log(`  ℹ ${text}`);
  }

  report() {
    totals.passed += this.passed;
    totals.failed += this.failed;
    totals.notes += this.notes.length;
    console.log(`\n[${this.label}] passed=${this.passed} failed=${this.failed} notes=${this.notes.length}`);
  }
}

// ───────────────────────────── HTTP layer ────────────────────────────

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

function expectStatus(res, codes, label) {
  if (!codes.includes(res.status)) {
    const detail = res.error
      ? `${res.error.code}: ${res.error.message}`
      : JSON.stringify(res.payload)?.slice(0, 400) ?? '(no body)';
    fail(`${label}: expected HTTP ${codes.join('/')} but got ${res.status} — ${detail}`);
  }
  return res;
}

function expectForbidden(res, label) {
  expectStatus(res, [403], label);
  equal(res.error?.code, 'FORBIDDEN', `${label} error code`);
}

function isAlreadyCancelled(res) {
  if (res.status !== 400) return false;
  const text = JSON.stringify(res.payload ?? res.error ?? {});
  return /ملغاة مسبقاً|already cancelled|cancelled already/i.test(text);
}

function isAlreadyClosed(res) {
  if (res.status !== 400) return false;
  const text = JSON.stringify(res.payload ?? res.error ?? {});
  return /مغلق مسبقاً|already closed|closed already/i.test(text);
}

async function closeStocktake(id, token, log, label) {
  const res = await apiFetch(`/stocktakes/${id}/close`, { method: 'POST', token, body: {} });
  if (res.ok) {
    equal(res.data?.status, 'CLOSED', `${label} status`);
    return true;
  }
  if (isAlreadyClosed(res)) {
    const detail = await apiFetch(`/stocktakes/${id}`, { token });
    expectStatus(detail, [200], `${label}: verify already-closed detail`);
    equal(detail.data?.status, 'CLOSED', `${label} already closed status`);
    log.note(`${label}: stocktake #${id} was already closed by another actor — verified CLOSED (idempotent)`);
    return true;
  }
  expectStatus(res, [200], label);
  return false;
}

async function loginRole(username, password) {
  const res = await apiFetch('/auth/login', { method: 'POST', body: { username, password } });
  expectStatus(res, [200], `POST /auth/login (${username})`);
  const token = sessionTokenFrom(res.headers);
  assert(token, `Login did not return a ${COOKIE_NAME} cookie for ${username}`);
  equal(res.data?.username, username, `login username (${username})`);
  assert(typeof res.data?.role === 'string', `login must return a role for ${username}`);
  return { token, user: res.data };
}

function pieceBody(name, extra = {}) {
  return {
    type: 'PIECE',
    name,
    karat: 21,
    totalWeight: 10,
    stoneWeight: 0,
    inlaysWeight: 0,
    purchaseGramPrice: 50,
    purchasePrice: 500,
    purchaseCurrency: 'LYD',
    purchaseStatus: 'NEW',
    quantity: 1,
    ...extra,
  };
}

// ───────────────────────────── one round ─────────────────────────────

async function runRound(round) {
  const qa = `${RUN_ID}-R${round}`;
  const log = new CheckLog(`Round ${round}/${ROUNDS}`);
  const ctx = {
    owner: null,
    seller: null,
    settingsOriginal: null,
    restoreSettings: false,
    lookups: [],
    items: [],
    sales: [],
    prices: [],
    stocktakes: [],
    leftovers: [],
  };

  try {
    // 1) public endpoints -------------------------------------------------
    await log.check('GET /health', async () => {
      const res = await apiFetch('/health');
      expectStatus(res, [200], 'GET /health');
      equal(res.data?.ok, true, 'health.ok');
      assert(typeof res.data?.time === 'string', 'health.time must be an ISO string');
    });

    await log.check('GET /bootstrap (anonymous)', async () => {
      const res = await apiFetch('/bootstrap');
      expectStatus(res, [200], 'GET /bootstrap');
      equal(res.data?.initialized, true, 'bootstrap.initialized');
      assert(!isObject(res.data) || !('shopName' in res.data), 'anonymous bootstrap must not leak shopName');
    });

    // 2) auth + session ---------------------------------------------------
    ctx.owner = await log.check('POST /auth/login owner', () =>
      loginRole(CREDENTIALS.owner.username, CREDENTIALS.owner.password),
    );
    if (!ctx.owner) return;
    equal(ctx.owner.user.role, 'OWNER', 'owner login role');
    ctx.seller = await log.check('POST /auth/login seller', () =>
      loginRole(CREDENTIALS.seller.username, CREDENTIALS.seller.password),
    );
    if (!ctx.seller) return;
    equal(ctx.seller.user.role, 'SELLER', 'seller login role');

    await log.check('GET /auth/me owner + seller', async () => {
      const owner = await apiFetch('/auth/me', { token: ctx.owner.token });
      expectStatus(owner, [200], 'GET /auth/me (owner)');
      equal(owner.data?.role, 'OWNER', 'owner /auth/me role');
      equal(owner.data?.username, 'admin', 'owner /auth/me username');
      const seller = await apiFetch('/auth/me', { token: ctx.seller.token });
      expectStatus(seller, [200], 'GET /auth/me (seller)');
      equal(seller.data?.role, 'SELLER', 'seller /auth/me role');
    });

    await log.check('GET /auth/me without cookie → 401', async () => {
      const res = await apiFetch('/auth/me');
      expectStatus(res, [401], 'GET /auth/me (anonymous)');
      equal(res.error?.code, 'UNAUTHORIZED', 'anonymous /auth/me error code');
    });

    await log.check('POST /auth/logout destroys session', async () => {
      const tmp = await loginRole(CREDENTIALS.seller.username, CREDENTIALS.seller.password);
      const before = await apiFetch('/auth/me', { token: tmp.token });
      expectStatus(before, [200], 'temp session before logout');
      const out = await apiFetch('/auth/logout', { method: 'POST', token: tmp.token });
      expectStatus(out, [200], 'POST /auth/logout');
      const after = await apiFetch('/auth/me', { token: tmp.token });
      expectStatus(after, [401], 'temp session after logout');
    });

    // 3) settings (owner GET/PATCH, seller forbidden) --------------------
    ctx.settingsOriginal = await log.check('GET /settings (owner)', async () => {
      const res = await apiFetch('/settings', { token: ctx.owner.token });
      expectStatus(res, [200], 'GET /settings');
      assert(isObject(res.data), 'settings response must be an object');
      return res.data;
    });
    if (!ctx.settingsOriginal) return;

    await log.check('PATCH /settings (owner)', async () => {
      const body = {
        shopName: `${qa} محل`,
        showCostToSeller: false,
        sellerCanAddItems: true,
        fixedBasis: 'PIECE',
      };
      const res = await apiFetch('/settings', { method: 'PATCH', token: ctx.owner.token, body });
      expectStatus(res, [200], 'PATCH /settings');
      equal(res.data?.shopName, body.shopName, 'settings.shopName after PATCH');
      equal(res.data?.showCostToSeller, false, 'settings.showCostToSeller after PATCH');
      equal(res.data?.sellerCanAddItems, true, 'settings.sellerCanAddItems after PATCH');
      if ('fixedBasis' in ctx.settingsOriginal) {
        equal(res.data?.fixedBasis, 'PIECE', 'settings.fixedBasis must round-trip after PATCH');
      }
      ctx.restoreSettings = true;
    });

    await log.check('PATCH /settings seller → 403', async () => {
      const res = await apiFetch('/settings', {
        method: 'PATCH',
        token: ctx.seller.token,
        body: { shopName: `${qa} محل مزيف` },
      });
      expectForbidden(res, 'seller PATCH /settings');
    });

    // 4) lookups ----------------------------------------------------------
    const groups = await log.check('GET /lookups grouped', async () => {
      const res = await apiFetch('/lookups', { token: ctx.owner.token });
      expectStatus(res, [200], 'GET /lookups');
      assert(isObject(res.data), 'grouped lookups must be an object');
      for (const kind of ['CATEGORY', 'SUPPLIER', 'MANUFACTURER', 'COUNTRY', 'PAYMENT_METHOD', 'KARAT']) {
        assert(Array.isArray(res.data[kind]), `lookups.${kind} must be an array`);
      }
      return res.data;
    });
    if (!groups) return;

    const categories = await log.check('GET /lookups?kind=CATEGORY', async () => {
      const res = await apiFetch('/lookups?kind=CATEGORY&activeOnly=true', { token: ctx.owner.token });
      expectStatus(res, [200], 'GET /lookups?kind=CATEGORY');
      assert(Array.isArray(res.data), 'CATEGORY lookups must be an array');
      return res.data;
    });
    if (!categories) return;

    const setCategory = categories.find((row) => row.value === 'طقم' && row.active);
    assert(setCategory, 'Seeded CATEGORY «طقم» is missing — cannot verify forced SET category');
    const otherCategory = categories.find((row) => row.active && row.value !== 'طقم');

    const paymentMethods = await log.check('GET /lookups?kind=PAYMENT_METHOD', async () => {
      const res = await apiFetch('/lookups?kind=PAYMENT_METHOD', { token: ctx.owner.token });
      expectStatus(res, [200], 'GET /lookups?kind=PAYMENT_METHOD');
      assert(Array.isArray(res.data), 'PAYMENT_METHOD lookups must be an array');
      return res.data;
    });
    const paymentMethod = paymentMethods?.find((row) => row.active && row.value === 'نقدي') ?? paymentMethods?.[0];

    ctx.supplier = await log.check('seller inline-add SUPPLIER', async () => {
      const res = await apiFetch('/lookups', {
        method: 'POST',
        token: ctx.seller.token,
        body: { kind: 'SUPPLIER', value: `${qa}-SUPPLIER` },
      });
      expectStatus(res, [201], 'POST /lookups SUPPLIER');
      equal(res.data?.kind, 'SUPPLIER', 'SUPPLIER lookup kind');
      ctx.lookups.push({ id: res.data.id, kind: 'SUPPLIER' });
      return res.data;
    });

    ctx.manufacturer = await log.check('seller inline-add MANUFACTURER', async () => {
      const res = await apiFetch('/lookups', {
        method: 'POST',
        token: ctx.seller.token,
        body: { kind: 'MANUFACTURER', value: `${qa}-MAKER` },
      });
      expectStatus(res, [201], 'POST /lookups MANUFACTURER');
      equal(res.data?.kind, 'MANUFACTURER', 'MANUFACTURER lookup kind');
      ctx.lookups.push({ id: res.data.id, kind: 'MANUFACTURER' });
      return res.data;
    });

    if (ctx.supplier) {
      await log.check('PATCH /lookups/:id (owner)', async () => {
        const res = await apiFetch(`/lookups/${ctx.supplier.id}`, {
          method: 'PATCH',
          token: ctx.owner.token,
          body: { sortOrder: 7 },
        });
        expectStatus(res, [200], 'PATCH /lookups/:id');
        equal(res.data?.sortOrder, 7, 'updated lookup sortOrder');
      });
    }

    await log.check('seller cannot add CATEGORY → 403', async () => {
      const res = await apiFetch('/lookups', {
        method: 'POST',
        token: ctx.seller.token,
        body: { kind: 'CATEGORY', value: `${qa}-FORBIDDEN` },
      });
      expectForbidden(res, 'seller POST /lookups CATEGORY');
    });

    // 5) manual prices (never call /prices/refresh-ounce) -----------------
    await log.check('GET /prices/current + manual price POST', async () => {
      const current = await apiFetch('/prices/current', { token: ctx.owner.token });
      expectStatus(current, [200], 'GET /prices/current');
      assert(isObject(current.data), 'prices/current must be an object');

      const ounceValue =
        isNumber(current.data?.ounce?.value) && current.data.ounce.value >= 100 && current.data.ounce.value <= 100000
          ? current.data.ounce.value
          : 3300;
      const fxValue =
        isNumber(current.data?.fx?.value) && current.data.fx.value > 0 && current.data.fx.value <= 10000
          ? current.data.fx.value
          : 1350;
      qaFxRate = fxValue;

      for (const [type, value] of [
        ['OUNCE', ounceValue],
        ['FX', fxValue],
      ]) {
        const res = await apiFetch('/prices', {
          method: 'POST',
          token: ctx.owner.token,
          body: { type, value },
        });
        expectStatus(res, [201], `POST /prices (${type})`);
        equal(res.data?.source, 'MANUAL', `${type} price source must be MANUAL`);
        equal(res.data?.type, type, `${type} price type`);
        ctx.prices.push({ id: res.data.id, type });
      }
    });
    if (ctx.prices.length < 2) return;

    await log.check('GET /prices/table + /prices/history', async () => {
      const table = await apiFetch('/prices/table', { token: ctx.owner.token });
      expectStatus(table, [200], 'GET /prices/table');
      equal(table.data?.ready, true, 'prices table must be ready after manual updates');
      assert(Array.isArray(table.data?.table?.rows) && table.data.table.rows.length > 0, 'price table rows missing');
      assert(isNumber(table.data.table.gramPrice24) && table.data.table.gramPrice24 > 0, 'gramPrice24 must be numeric');

      const history = await apiFetch('/prices/history?pageSize=20', { token: ctx.owner.token });
      expectStatus(history, [200], 'GET /prices/history');
      assert(Array.isArray(history.data?.rows), 'price history rows must be an array');
      for (const price of ctx.prices) {
        assert(history.data.rows.some((row) => row.id === price.id), `manual price #${price.id} missing from history`);
      }
    });

    // 6) items ------------------------------------------------------------
    ctx.piece = await log.check('POST /items PIECE (owner)', async () => {
      const body = pieceBody(`${qa}-PIECE`, {
        supplierId: ctx.supplier?.id ?? null,
        manufacturerId: ctx.manufacturer?.id ?? null,
      });
      const res = await apiFetch('/items', { method: 'POST', token: ctx.owner.token, body });
      expectStatus(res, [201], 'POST /items PIECE');
      equal(res.data?.type, 'PIECE', 'new item type');
      assert(isNumber(res.data?.purchaseCostDinar) && res.data.purchaseCostDinar > 0, 'owner must receive purchaseCostDinar');
      ctx.items.push({ id: res.data.id, code: res.data.code, name: res.data.name });
      return res.data;
    });
    if (!ctx.piece) return;

    ctx.setItem = await log.check('POST /items SET (forced category + components)', async () => {
      const body = {
        type: 'SET',
        name: `${qa}-SET`,
        karat: 21,
        // Deliberately a different category: the server must force «طقم».
        categoryId: otherCategory?.id ?? null,
        quantity: 1,
        purchaseCurrency: 'LYD',
        purchasePrice: 0,
        components: [
          { kind: 'RING', name: `${qa}-C1`, karat: 21, weight: 4, stoneWeight: 0, inlaysWeight: 0 },
          { kind: 'BRACELET', name: `${qa}-C2`, karat: 21, weight: 6, stoneWeight: 0, inlaysWeight: 0 },
        ],
      };
      const res = await apiFetch('/items', { method: 'POST', token: ctx.owner.token, body });
      expectStatus(res, [201], 'POST /items SET');
      equal(res.data?.categoryId, setCategory.id, 'SET category must be forced to «طقم»');
      equal(res.data?.category?.value, 'طقم', 'SET category lookup value');
      assert(Array.isArray(res.data?.components) && res.data.components.length === 2, 'SET component count must be 2 in create response');
      ctx.items.push({ id: res.data.id, code: res.data.code, name: res.data.name });
      return res.data;
    });

    ctx.sellerItem = await log.check('POST /items seller inline-add (cost hidden)', async () => {
      const res = await apiFetch('/items', {
        method: 'POST',
        token: ctx.seller.token,
        body: {
          type: 'PIECE',
          name: `${qa}-SELLER-PIECE`,
          karat: 21,
          totalWeight: 2,
          quantity: 1,
          purchaseCurrency: 'LYD',
          purchasePrice: 0,
        },
      });
      expectStatus(res, [201], 'POST /items (seller)');
      assert(!('purchaseCostDinar' in (res.data ?? {})), 'seller must not see purchaseCostDinar when showCostToSeller=false');
      ctx.items.push({ id: res.data.id, code: res.data.code, name: res.data.name });
      return res.data;
    });

    await log.check('GET /items (q search, owner sees cost)', async () => {
      const res = await apiFetch(`/items?q=${encodeURIComponent(qa)}&pageSize=100`, { token: ctx.owner.token });
      expectStatus(res, [200], 'GET /items');
      assert(Array.isArray(res.data?.rows) && isNumber(res.data?.total), 'items list shape invalid');
      const ids = res.data.rows.map((row) => row.id);
      for (const item of ctx.items) {
        assert(ids.includes(item.id), `QA item #${item.id} missing from items list`);
      }
      const row = res.data.rows.find((r) => r.id === ctx.piece.id);
      assert(isNumber(row?.purchaseCostDinar), 'owner must see purchaseCostDinar in items list');
      if (ctx.setItem) {
        const setRow = res.data.rows.find((r) => r.id === ctx.setItem.id);
        assert(Array.isArray(setRow?.components) && setRow.components.length === 2, 'SET component count must be visible in items list');
      }
    });

    await log.check('GET /items/:id, /items/by-code/:code, /items/next-code', async () => {
      const detail = await apiFetch(`/items/${ctx.setItem.id}`, { token: ctx.owner.token });
      expectStatus(detail, [200], 'GET /items/:id (SET)');
      assert(Array.isArray(detail.data?.components) && detail.data.components.length === 2, 'SET component count must be visible in detail');
      equal(detail.data.categoryId, setCategory.id, 'SET detail category');

      const byCode = await apiFetch(`/items/by-code/${encodeURIComponent(ctx.setItem.code)}`, { token: ctx.owner.token });
      expectStatus(byCode, [200], 'GET /items/by-code/:code');
      equal(byCode.data?.id, ctx.setItem.id, 'by-code item id');

      const next = await apiFetch('/items/next-code?type=PIECE', { token: ctx.owner.token });
      expectStatus(next, [200], 'GET /items/next-code');
      assert('code' in (next.data ?? {}), 'next-code must return a code field');
    });

    await log.check('seller item detail hides cost', async () => {
      const res = await apiFetch(`/items/${ctx.piece.id}`, { token: ctx.seller.token });
      expectStatus(res, [200], 'GET /items/:id (seller)');
      assert(!('purchaseCostDinar' in (res.data ?? {})), 'seller must not see purchaseCostDinar in item detail');
    });

    await log.check('PATCH /items/:id (owner)', async () => {
      const body = pieceBody(`${qa}-PIECE-UPD`, { totalWeight: 11, purchaseGramPrice: 60, purchasePrice: 660 });
      const res = await apiFetch(`/items/${ctx.piece.id}`, { method: 'PATCH', token: ctx.owner.token, body });
      expectStatus(res, [200], 'PATCH /items/:id');
      equal(res.data?.name, body.name, 'updated item name');
      equal(Number(res.data?.totalWeight), 11, 'updated item totalWeight');
    });

    await log.check('seller PATCH/DELETE item → 403', async () => {
      const patch = await apiFetch(`/items/${ctx.piece.id}`, {
        method: 'PATCH',
        token: ctx.seller.token,
        body: pieceBody(`${qa}-HACK`),
      });
      expectForbidden(patch, 'seller PATCH /items/:id');
      const del = await apiFetch(`/items/${ctx.piece.id}`, { method: 'DELETE', token: ctx.seller.token });
      expectForbidden(del, 'seller DELETE /items/:id');
    });

    // 7) sales (all four profit modes, fixedBasis round-trip, cancel) ----
    const saleCases = [
      { key: 'PERCENT', profitMode: 'PERCENT', profitValue: 5, fxMode: 'CASH' },
      { key: 'FIXED_PIECE', profitMode: 'FIXED', profitValue: 25, fixedBasis: 'PIECE', fxMode: 'CASH' },
      { key: 'FIXED_GRAM', profitMode: 'FIXED', profitValue: 2, fixedBasis: 'GRAM', fxMode: 'CHEQUE', fxRate: qaFxRate },
      { key: 'MANUAL', profitMode: 'MANUAL', profitValue: 0, fxMode: 'CASH' },
    ];

    for (const saleCase of saleCases) {
      const saleItem = await log.check(`create item for sale ${saleCase.key}`, async () => {
        const res = await apiFetch('/items', {
          method: 'POST',
          token: ctx.owner.token,
          body: pieceBody(`${qa}-SALE-${saleCase.key}`, { totalWeight: 5, purchasePrice: 250, purchaseGramPrice: 50 }),
        });
        expectStatus(res, [201], `POST /items for sale ${saleCase.key}`);
        ctx.items.push({ id: res.data.id, code: res.data.code, name: res.data.name });
        return res.data;
      });
      if (!saleItem) continue;

      const created = await log.check(`POST /sales ${saleCase.key}`, async () => {
        const body = {
          items: [{ itemId: saleItem.id, quantity: 1, unitPrice: 1000 }],
          paymentMethodId: paymentMethod?.id ?? null,
          customerName: `${qa}-${saleCase.key}`,
          customerPhone: 'QA-000',
          profitMode: saleCase.profitMode,
          profitValue: saleCase.profitValue,
          roundingStep: 0,
          fxMode: saleCase.fxMode,
          fxRate: saleCase.fxRate ?? null,
          ...(saleCase.fixedBasis ? { fixedBasis: saleCase.fixedBasis } : {}),
        };
        const res = await apiFetch('/sales', { method: 'POST', token: ctx.seller.token, body });
        expectStatus(res, [201], `POST /sales ${saleCase.key}`);
        equal(res.data?.profitMode, saleCase.profitMode, `${saleCase.key} profitMode`);
        equal(Number(res.data?.profitValue), saleCase.profitValue, `${saleCase.key} profitValue`);
        if (saleCase.fixedBasis) {
          equal(res.data?.fixedBasis, saleCase.fixedBasis, `${saleCase.key} fixedBasis in create response`);
        }
        ctx.sales.push({
          id: res.data.id,
          invoiceNo: res.data.invoiceNo,
          itemId: saleItem.id,
          cancelled: false,
          profitMode: saleCase.profitMode,
          fixedBasis: saleCase.fixedBasis,
        });
        return res.data;
      });
      if (!created) continue;

      await log.check(`GET /sales/:id ${saleCase.key} (policy + cost source)`, async () => {
        const res = await apiFetch(`/sales/${created.id}`, { token: ctx.owner.token });
        expectStatus(res, [200], `GET /sales/:id (${saleCase.key})`);
        equal(res.data?.invoiceNo, created.invoiceNo, `${saleCase.key} invoiceNo`);
        assert(isNumber(res.data?.total), `${saleCase.key} detail.total must be numeric`);
        assert(Array.isArray(res.data?.items) && res.data.items.length > 0, `${saleCase.key} detail.items missing`);
        for (const line of res.data.items) {
          assert(isNumber(line?.lineTotal), `${saleCase.key} items[].lineTotal must be numeric`);
        }
        equal(res.data?.profitMode, saleCase.profitMode, `${saleCase.key} detail profitMode`);
        equal(Number(res.data?.profitValue), saleCase.profitValue, `${saleCase.key} detail profitValue`);
        equal(res.data?.roundingStep, 0, `${saleCase.key} detail roundingStep`);
        equal(res.data?.fxMode, saleCase.fxMode, `${saleCase.key} detail fxMode`);
        if (saleCase.fixedBasis) {
          equal(
            res.data?.fixedBasis,
            saleCase.fixedBasis,
            `fixedBasis must round-trip from GET /sales/:id — يجب أن يعود أساس الربح الثابت كما حُفظ (${saleCase.fixedBasis})`,
          );
        }

        // The UI computes purchase cost / profit from the sold item via GET /items/:id,
        // NOT from the sale detail. Assert that source is available to the owner.
        const soldItemId = res.data.items[0]?.itemId ?? saleItem.id;
        const soldItem = await apiFetch(`/items/${soldItemId}`, { token: ctx.owner.token });
        expectStatus(soldItem, [200], `GET /items/:id (cost source for ${saleCase.key})`);
        assert(
          isNumber(soldItem.data?.purchaseCostDinar),
          `sold item #${soldItemId} must expose numeric purchaseCostDinar as the cost/profit source — يجب أن يكون مصدر التكلفة والربح رقماً`,
        );
      });
    }

    await log.check('GET /sales list contains QA invoices', async () => {
      const from = new Date(Date.now() - 10 * 60 * 1000).toISOString();
      const res = await apiFetch(`/sales?pageSize=100&from=${encodeURIComponent(from)}`, { token: ctx.owner.token });
      expectStatus(res, [200], 'GET /sales');
      assert(Array.isArray(res.data?.rows), 'sales list rows must be an array');
      for (const sale of ctx.sales) {
        const row = res.data.rows.find((r) => r.id === sale.id);
        assert(row, `QA sale #${sale.id} missing from sales list`);
        if (sale.fixedBasis && 'fixedBasis' in row) {
          equal(row.fixedBasis, sale.fixedBasis, `${sale.invoiceNo} fixedBasis in sales list`);
        }
      }
    });

    const toCancel = ctx.sales.find((sale) => sale.profitMode === 'PERCENT') ?? ctx.sales[0];
    if (toCancel) {
      await log.check('seller cancel sale → 403', async () => {
        const res = await apiFetch(`/sales/${toCancel.id}/cancel`, {
          method: 'POST',
          token: ctx.seller.token,
          body: { reason: `${qa} seller should be forbidden` },
        });
        expectForbidden(res, 'seller POST /sales/:id/cancel');
      });

      await log.check('OWNER cancel sale restores stock', async () => {
        const before = await apiFetch(`/items/${toCancel.itemId}`, { token: ctx.owner.token });
        expectStatus(before, [200], 'item before cancel');
        const res = await apiFetch(`/sales/${toCancel.id}/cancel`, {
          method: 'POST',
          token: ctx.owner.token,
          body: { reason: `${qa} QA cancellation test` },
        });
        expectStatus(res, [200], 'POST /sales/:id/cancel');
        equal(res.data?.status, 'CANCELLED', 'cancelled sale status');
        // Mark immediately: cleanup must never try to cancel the same sale twice.
        toCancel.cancelled = true;

        // The cancel response does not include cancelledBy; the detail does.
        const detail = await apiFetch(`/sales/${toCancel.id}`, { token: ctx.owner.token });
        expectStatus(detail, [200], 'GET /sales/:id after cancel');
        equal(detail.data?.status, 'CANCELLED', 'cancelled sale detail status');
        assert(detail.data?.cancelledBy?.name, 'cancelledBy.name must be populated in sale detail after cancel');

        const after = await apiFetch(`/items/${toCancel.itemId}`, { token: ctx.owner.token });
        expectStatus(after, [200], 'item after cancel');
        equal(after.data?.quantity, before.data?.quantity + 1, 'cancelled sale must restore item quantity');
        equal(after.data?.status, 'AVAILABLE', 'cancelled sale must restore item status');
      });
    }

    // 8) inventory / dashboard / reports ---------------------------------
    await log.check('GET /inventory/summary owner (cost + margin)', async () => {
      const res = await apiFetch('/inventory/summary', { token: ctx.owner.token });
      expectStatus(res, [200], 'GET /inventory/summary');
      assert(Array.isArray(res.data?.rows) && Array.isArray(res.data?.byKarat), 'inventory shape invalid');
      assert(isNumber(res.data?.totals?.cost) && isNumber(res.data?.totals?.margin), 'owner inventory totals must include cost and margin');
      const row = res.data.rows.find((r) => r.id === ctx.piece.id || r.id === ctx.setItem.id);
      assert(isNumber(row?.cost) && isNumber(row?.margin), 'owner inventory rows must include cost and margin');
    });

    await log.check('GET /inventory/summary seller (cost hidden)', async () => {
      const res = await apiFetch('/inventory/summary', { token: ctx.seller.token });
      expectStatus(res, [200], 'GET /inventory/summary (seller)');
      assert(!('cost' in (res.data?.totals ?? {})), 'seller must not see inventory totals.cost when showCostToSeller=false');
      assert(
        !(res.data?.rows ?? []).some((r) => 'cost' in r),
        'seller must not see inventory row cost when showCostToSeller=false',
      );
    });

    await log.check('GET /dashboard owner + seller', async () => {
      const owner = await apiFetch('/dashboard', { token: ctx.owner.token });
      expectStatus(owner, [200], 'GET /dashboard (owner)');
      assert(isObject(owner.data?.today) && isObject(owner.data?.month) && isObject(owner.data?.inventory), 'dashboard shape invalid');
      equal(owner.data?.user?.role, 'OWNER', 'dashboard user role (owner)');
      const seller = await apiFetch('/dashboard', { token: ctx.seller.token });
      expectStatus(seller, [200], 'GET /dashboard (seller)');
      equal(seller.data?.user?.role, 'SELLER', 'dashboard user role (seller)');
    });

    await log.check('GET /reports/sales', async () => {
      const res = await apiFetch('/reports/sales', { token: ctx.owner.token });
      expectStatus(res, [200], 'GET /reports/sales');
      assert(
        isNumber(res.data?.count) && isNumber(res.data?.total) && Array.isArray(res.data?.bySeller) && Array.isArray(res.data?.rows),
        'sales report shape invalid: count/total must be numeric and bySeller/rows must be arrays',
      );
    });

    await log.check('GET /reports/profit (cost/profit)', async () => {
      const res = await apiFetch('/reports/profit', { token: ctx.owner.token });
      expectStatus(res, [200], 'GET /reports/profit');
      for (const key of ['revenue', 'cost', 'profit', 'marginPercent']) {
        assert(isNumber(res.data?.[key]), `profit report.${key} must be numeric`);
      }
      assert(Array.isArray(res.data?.rows) && res.data.rows.length > 0, 'profit report rows missing');
    });

    await log.check('GET /reports/inventory', async () => {
      const res = await apiFetch('/reports/inventory', { token: ctx.owner.token });
      expectStatus(res, [200], 'GET /reports/inventory');
      assert(isNumber(res.data?.totalValue) && isNumber(res.data?.totalCost) && Array.isArray(res.data?.rows), 'inventory report shape invalid');
      assert(res.data.rows.some((r) => isNumber(r.cost) && isNumber(r.margin)), 'inventory report rows must include cost and margin');
    });

    await log.check('GET /reports/prices', async () => {
      const res = await apiFetch('/reports/prices', { token: ctx.owner.token });
      expectStatus(res, [200], 'GET /reports/prices');
      assert(Array.isArray(res.data), 'prices report must be an array');
      for (const price of ctx.prices) {
        assert(res.data.some((row) => row.id === price.id), `QA price #${price.id} missing from prices report`);
      }
    });

    await log.check('GET /reports/audit', async () => {
      const res = await apiFetch('/reports/audit?take=200', { token: ctx.owner.token });
      expectStatus(res, [200], 'GET /reports/audit');
      assert(Array.isArray(res.data), 'audit report must be an array');
      assert(
        res.data.some((entry) => entry.action === 'CREATE_SALE' && ctx.sales.some((s) => String(s.id) === String(entry.entityId))),
        'audit log must contain CREATE_SALE entries for QA sales',
      );
    });

    await log.check('seller GET /reports/* → 403', async () => {
      const res = await apiFetch('/reports/sales', { token: ctx.seller.token });
      expectForbidden(res, 'seller GET /reports/sales');
    });

    // 9) stocktakes -------------------------------------------------------
    const stocktakeList = await log.check('GET /stocktakes', async () => {
      const res = await apiFetch('/stocktakes', { token: ctx.owner.token });
      expectStatus(res, [200], 'GET /stocktakes');
      assert(Array.isArray(res.data), 'stocktakes must be an array');
      return res.data;
    });

    const openRows = (stocktakeList ?? []).filter((row) => row.status === 'OPEN');
    for (const row of openRows) {
      ctx.stocktakes.push({ id: row.id, closed: false, preExisting: true });
    }
    if (openRows.length > 0) {
      log.note(
        `QA ${qa} is reusing pre-existing OPEN stocktake(s) [${openRows.map((r) => r.id).join(', ')}] ` +
          `for count/differences/close; they are closed, never deleted.`,
      );
    }

    let opened;
    if (openRows.length > 0) {
      opened = await log.check('GET pre-existing OPEN stocktake detail', async () => {
        const res = await apiFetch(`/stocktakes/${openRows[0].id}`, { token: ctx.owner.token });
        expectStatus(res, [200], 'GET /stocktakes/:id (pre-existing OPEN)');
        equal(res.data?.status, 'OPEN', 'pre-existing stocktake must still be OPEN');
        assert(Array.isArray(res.data?.lines), 'stocktake lines must be an array');
        return res.data;
      });
    } else {
      opened = await log.check('POST /stocktakes open', async () => {
        const res = await apiFetch('/stocktakes', {
          method: 'POST',
          token: ctx.owner.token,
          body: { type: 'QUARTERLY', notes: `${qa} QA stocktake` },
        });
        expectStatus(res, [201], 'POST /stocktakes');
        equal(res.data?.status, 'OPEN', 'new stocktake status');
        assert(Array.isArray(res.data?.lines), 'stocktake lines must be an array');
        ctx.stocktakes.push({ id: res.data.id, closed: false, preExisting: false });
        return res.data;
      });
    }

    if (opened) {
      await log.check('GET /stocktakes/:id', async () => {
        const res = await apiFetch(`/stocktakes/${opened.id}`, { token: ctx.owner.token });
        expectStatus(res, [200], 'GET /stocktakes/:id');
        equal(res.data?.id, opened.id, 'stocktake detail id');
        assert(Array.isArray(res.data?.lines), 'stocktake detail lines must be an array');
      });

      await log.check('PATCH /stocktakes/:id/lines/:lineId count', async () => {
        const lines = (opened.lines ?? []).slice(0, 3);
        assert(lines.length > 0, 'stocktake has no lines to count');
        for (const line of lines) {
          const res = await apiFetch(`/stocktakes/${opened.id}/lines/${line.id}`, {
            method: 'PATCH',
            token: ctx.owner.token,
            body: { countedWeight: Number(line.expectedWeight), present: true },
          });
          expectStatus(res, [200], `PATCH stocktake line #${line.id}`);
          equal(Number(res.data?.weightDiff), 0, `stocktake line #${line.id} weightDiff`);
        }
        const differences = await apiFetch(`/stocktakes/${opened.id}/differences`, { token: ctx.owner.token });
        expectStatus(differences, [200], 'GET /stocktakes/:id/differences');
        assert(isObject(differences.data?.counts), 'stocktake differences counts missing');
      });

      await log.check('POST /stocktakes/:id/close', async () => {
        await closeStocktake(opened.id, ctx.owner.token, log, 'POST /stocktakes/:id/close');
        const tracked = ctx.stocktakes.find((row) => row.id === opened.id);
        if (tracked) tracked.closed = true;
      });

      // Close any other OPEN stocktake we inherited, so the run leaves none behind.
      for (const tracked of ctx.stocktakes.filter((row) => !row.closed && row.id !== opened.id)) {
        await log.check(`POST /stocktakes/${tracked.id}/close (pre-existing OPEN)`, async () => {
          const res = await apiFetch(`/stocktakes/${tracked.id}/close`, {
            method: 'POST',
            token: ctx.owner.token,
            body: {},
          });
          if (res.status === 404) {
            tracked.closed = true;
            return;
          }
          if (isAlreadyClosed(res)) {
            const detail = await apiFetch(`/stocktakes/${tracked.id}`, { token: ctx.owner.token });
            expectStatus(detail, [200], `verify pre-existing stocktake #${tracked.id}`);
            equal(detail.data?.status, 'CLOSED', `pre-existing stocktake #${tracked.id} status`);
            tracked.closed = true;
            return;
          }
          expectStatus(res, [200], `close pre-existing stocktake #${tracked.id}`);
          equal(res.data?.status, 'CLOSED', `pre-existing stocktake #${tracked.id} status`);
          tracked.closed = true;
        });
      }

      await log.check('verify no OPEN stocktake remains', async () => {
        const res = await apiFetch('/stocktakes', { token: ctx.owner.token });
        expectStatus(res, [200], 'GET /stocktakes (final check)');
        assert(Array.isArray(res.data), 'stocktakes must be an array');
        assert(!res.data.some((row) => row.status === 'OPEN'), 'an OPEN stocktake still exists after QA close');
      });
    }

    // 10) users -----------------------------------------------------------
    await log.check('GET /users owner only', async () => {
      const owner = await apiFetch('/users', { token: ctx.owner.token });
      expectStatus(owner, [200], 'GET /users (owner)');
      assert(Array.isArray(owner.data), 'users list must be an array');
      assert(owner.data.some((u) => u.username === 'admin' && u.role === 'OWNER'), 'owner admin missing from users list');
      assert(owner.data.some((u) => u.username === 'seller' && u.role === 'SELLER'), 'seller missing from users list');

      const seller = await apiFetch('/users', { token: ctx.seller.token });
      expectForbidden(seller, 'seller GET /users');
      const sellerCreate = await apiFetch('/users', {
        method: 'POST',
        token: ctx.seller.token,
        body: { name: 'QA Hack', username: `${RUN_ID}-HACK`, password: 'QaPass@2026', role: 'SELLER' },
      });
      expectForbidden(sellerCreate, 'seller POST /users');
    });
  } catch (err) {
    // Defensive: all expected assertion failures are already captured by check().
    log.failed += 1;
    console.error(`  ✗ round aborted unexpectedly: ${errText(err)}`);
  } finally {
    await cleanup(ctx, log, qa);
    log.report();
  }
}

// ───────────────────────────── cleanup ────────────────────────────────

async function cleanup(ctx, log, qa) {
  if (!ctx.owner?.token) {
    log.note('cleanup skipped: no owner session available');
    return;
  }

  for (const sale of ctx.sales) {
    if (sale.cancelled) continue;
    await log.check(`cleanup: cancel QA sale #${sale.id}`, async () => {
      const res = await apiFetch(`/sales/${sale.id}/cancel`, {
        method: 'POST',
        token: ctx.owner.token,
        body: { reason: `${qa} cleanup` },
      });
      if (res.status === 404) {
        ctx.leftovers.push(`sale #${sale.id} (${sale.invoiceNo}) no longer exists at cleanup`);
        sale.cancelled = true;
        return;
      }
      if (isAlreadyCancelled(res)) {
        log.note(`cleanup: sale #${sale.id} ${sale.invoiceNo} was already cancelled — marking as cancelled (idempotent)`);
        sale.cancelled = true;
        return;
      }
      expectStatus(res, [200], `cleanup cancel sale #${sale.id}`);
      sale.cancelled = true;
    });
  }

  if (ctx.restoreSettings && ctx.settingsOriginal) {
    await log.check('cleanup: restore original settings', async () => {
      const body = {};
      for (const key of ['shopName', 'showCostToSeller', 'sellerCanAddItems', 'fixedBasis']) {
        if (key in ctx.settingsOriginal) body[key] = ctx.settingsOriginal[key];
      }
      const res = await apiFetch('/settings', { method: 'PATCH', token: ctx.owner.token, body });
      expectStatus(res, [200], 'cleanup PATCH /settings restore');
      if ('shopName' in body) equal(res.data?.shopName, body.shopName, 'restored shopName');
    });
  }

  for (const item of ctx.items) {
    await log.check(`cleanup: delete QA item #${item.id}`, async () => {
      const res = await apiFetch(`/items/${item.id}`, { method: 'DELETE', token: ctx.owner.token });
      if (res.status === 409) {
        ctx.leftovers.push(`item #${item.id} ${item.code} — linked to a sale, API correctly refuses delete`);
        return;
      }
      expectStatus(res, [200], `cleanup delete item #${item.id}`);
    });
  }

  for (const lookup of ctx.lookups) {
    await log.check(`cleanup: delete QA lookup #${lookup.id}`, async () => {
      const res = await apiFetch(`/lookups/${lookup.id}`, { method: 'DELETE', token: ctx.owner.token });
      if (res.status === 404) return;
      expectStatus(res, [200], `cleanup delete lookup #${lookup.id}`);
      if (res.data?.deactivated) {
        ctx.leftovers.push(`lookup #${lookup.id} (${lookup.kind}) — in use, API deactivated it instead of deleting`);
      }
    });
  }

  for (const stocktake of ctx.stocktakes) {
    if (stocktake.closed) continue;
    await log.check(`cleanup: close QA stocktake #${stocktake.id}`, async () => {
      const probe = await apiFetch(`/stocktakes/${stocktake.id}`, { token: ctx.owner.token });
      if (probe.status === 404) {
        stocktake.closed = true;
        return;
      }
      if (probe.data?.status === 'CLOSED') {
        stocktake.closed = true;
        return;
      }
      await closeStocktake(stocktake.id, ctx.owner.token, log, `cleanup close stocktake #${stocktake.id}`);
      stocktake.closed = true;
    });
  }

  // Append-only / non-deletable rows: report them explicitly.
  for (const price of ctx.prices) {
    ctx.leftovers.push(`priceUpdate #${price.id} (${price.type}, MANUAL) — no delete endpoint`);
  }
  for (const stocktake of ctx.stocktakes) {
    ctx.leftovers.push(
      `stocktake #${stocktake.id} (${stocktake.preExisting ? 'pre-existing, closed by QA' : `QA ${qa}`}, ${stocktake.closed ? 'CLOSED' : 'OPEN'}) — no delete endpoint`,
    );
  }
  for (const sale of ctx.sales) {
    ctx.leftovers.push(
      `sale #${sale.id} ${sale.invoiceNo} (${sale.cancelled ? 'CANCELLED' : 'COMPLETED'}) — no delete endpoint`,
    );
  }

  if (ctx.leftovers.length === 0) {
    log.note('cleanup: no leftovers');
  } else {
    log.note(`cleanup leftovers (${ctx.leftovers.length}) — QA-created rows use prefix ${qa}; pre-existing rows are listed explicitly:`);
    for (const entry of ctx.leftovers) log.note(`   • ${entry}`);
    log.note('auditLog rows and login sessions are append-only by design and are not deleted.');
  }
}

// ───────────────────────────── entrypoint ─────────────────────────────

async function main() {
  console.log(`Integration test | ${BASE} | rounds=${ROUNDS} | runId=${RUN_ID}`);
  for (let round = 1; round <= ROUNDS; round += 1) {
    await runRound(round);
  }
  console.log(
    `\n=== Integration summary: rounds=${ROUNDS} passed=${totals.passed} failed=${totals.failed} notes=${totals.notes} → ${totals.failed === 0 ? 'PASS' : 'FAIL'} ===`,
  );
  if (totals.failed !== 0) process.exitCode = 1;
}

main().catch((err) => {
  console.error(`FATAL: ${errText(err)}`);
  process.exitCode = 1;
});
