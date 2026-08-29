// Tests de las métricas persistentes anónimas y el panel privado.

import { test, beforeEach, after } from 'node:test';
import assert from 'node:assert/strict';
import { recordEvent, getStats, _setStoreForTests, ALLOWED_EVENTS, MAX_EVENT_COUNT } from '../netlify/functions/lib/track.mjs';

// Store falso en memoria con la interfaz de Netlify Blobs que usamos.
function fakeStore() {
  const data = new Map();
  return {
    data,
    async get(key) { return data.get(key) ?? null; },
    async set(key, value) { data.set(key, String(value)); },
  };
}

let store;
beforeEach(() => {
  store = fakeStore();
  _setStoreForTests(() => store);
});
after(() => _setStoreForTests(null));

const DAY = new Date().toISOString().slice(0, 10);

test('recordEvent suma 1 al contador diario y al acumulado', async () => {
  await recordEvent('cv_generated');
  await recordEvent('cv_generated');
  assert.equal(store.data.get(`${DAY}/cv_generated`), '2');
  assert.equal(store.data.get('totales/cv_generated'), '2');
});

test('job_matches_shown suma la cantidad real de ofertas mostradas', async () => {
  await recordEvent('job_matches_shown', 7);
  await recordEvent('job_matches_shown', 12);
  assert.equal(store.data.get('totales/job_matches_shown'), '19');
});

test('el count se ignora en eventos que no lo admiten', async () => {
  await recordEvent('job_listing_clicked', 500);
  assert.equal(store.data.get('totales/job_listing_clicked'), '1');
});

test('el count tiene tope y piso defensivos', async () => {
  await recordEvent('job_matches_shown', 9999);
  assert.equal(store.data.get('totales/job_matches_shown'), String(MAX_EVENT_COUNT));
  store.data.clear();
  await recordEvent('job_matches_shown', -5);
  assert.equal(store.data.get('totales/job_matches_shown'), '1');
  store.data.clear();
  await recordEvent('job_matches_shown', 'no-numérico');
  assert.equal(store.data.get('totales/job_matches_shown'), '1');
});

test('eventos desconocidos no se registran', async () => {
  const r = await recordEvent('robar_datos', 1);
  assert.equal(r.ok, false);
  assert.equal(store.data.size, 0);
});

test('getStats devuelve acumulados y contadores de hoy', async () => {
  await recordEvent('cv_generated');
  await recordEvent('job_search_completed');
  await recordEvent('job_matches_shown', 12);
  const stats = await getStats();
  assert.equal(stats.storage, 'blobs');
  assert.equal(stats.totals.cv_generated, 1);
  assert.equal(stats.totals.job_search_completed, 1);
  assert.equal(stats.totals.job_matches_shown, 12);
  assert.equal(stats.today.job_matches_shown, 12);
  for (const e of ALLOWED_EVENTS) assert.ok(e in stats.totals);
});

test('sin Blobs disponible, recordEvent no lanza y getStats da ceros', async () => {
  _setStoreForTests(() => { throw new Error('sin blobs'); });
  const r = await recordEvent('cv_generated');
  assert.equal(r.ok, true);
  assert.equal(r.storage, 'log');
  const stats = await getStats();
  assert.equal(stats.storage, 'unavailable');
  assert.equal(stats.totals.cv_generated, 0);
});

// ---------- Endpoint track-event con count ----------

test('track-event acepta count para job_matches_shown y lo valida', async () => {
  const handler = (await import('../netlify/functions/track-event.mjs')).default;
  const post = (body) => new Request('http://x/', { method: 'POST', body: JSON.stringify(body) });

  const ok = await handler(post({ event: 'job_matches_shown', count: 7 }), {});
  assert.equal(ok.status, 200);
  assert.equal(store.data.get('totales/job_matches_shown'), '7');

  await handler(post({ event: 'cv_generated', count: 99 }), {}); // count ignorado
  assert.equal(store.data.get('totales/cv_generated'), '1');

  const bad = await handler(post({ event: 'evento_falso', count: 3 }), {});
  assert.equal(bad.status, 400);
});

// ---------- Panel privado admin-stats ----------

test('admin-stats devuelve 404 sin token configurado, con token incorrecto, y 200 con el correcto', async () => {
  const handler = (await import('../netlify/functions/admin-stats.mjs')).default;
  const get = (qs = '') => new Request(`http://x/.netlify/functions/admin-stats${qs}`, { method: 'GET' });

  delete process.env.ADMIN_STATS_TOKEN;
  assert.equal((await handler(get('?token=loquesea'), {})).status, 404);

  process.env.ADMIN_STATS_TOKEN = 'token-secreto-de-test';
  try {
    assert.equal((await handler(get(), {})).status, 404);
    assert.equal((await handler(get('?token=incorrecto'), {})).status, 404);

    await recordEvent('job_matches_shown', 12);
    await recordEvent('cv_generated');
    const res = await handler(get('?token=token-secreto-de-test'), {});
    assert.equal(res.status, 200);
    const html = await res.text();
    assert.match(html, /Métricas de impacto/);
    assert.match(html, /noindex/);

    const jsonRes = await handler(get('?token=token-secreto-de-test&format=json'), {});
    const data = await jsonRes.json();
    assert.equal(data.totals.job_matches_shown, 12);
    assert.equal(data.totals.cv_generated, 1);
  } finally {
    delete process.env.ADMIN_STATS_TOKEN;
  }
});

// ---------- Backfill histórico de acumulados ----------

function fakeStoreWithList() {
  const data = new Map();
  return {
    data,
    async get(key) { return data.get(key) ?? null; },
    async set(key, value) { data.set(key, String(value)); },
    async list() { return { blobs: [...data.keys()].map((key) => ({ key })) }; },
  };
}

test('backfillTotals recalcula acumulados sumando SOLO los contadores diarios reales', async () => {
  const s = fakeStoreWithList();
  _setStoreForTests(() => s);
  // Histórico previo a los acumulados:
  s.data.set('2026-08-09/cv_generated', '3');
  s.data.set('2026-08-10/cv_generated', '2');
  s.data.set('2026-08-10/job_matches_shown', '24');
  s.data.set('2026-08-15/job_search_completed', '4');
  s.data.set('2026-08-15/oportunidades_started', '9');
  s.data.set('2026-08-20/outcome_hired', '1');
  // Acumulado nuevo desactualizado (solo capturó lo reciente):
  s.data.set('totales/cv_generated', '1');
  // Claves ajenas que deben ignorarse:
  s.data.set('2026-08-11/evento_desconocido', '99');
  s.data.set('migraciones/otra-cosa', 'x');

  const { backfillTotals } = await import('../netlify/functions/lib/track.mjs');
  const r = await backfillTotals(new Date('2026-08-29T12:00:00Z'));

  assert.equal(r.ok, true);
  assert.equal(r.before.cv_generated, 1);
  assert.equal(r.after.cv_generated, 5);        // 3 + 2, no 1+5
  assert.equal(r.after.job_matches_shown, 24);
  assert.equal(r.after.job_search_completed, 4);
  assert.equal(r.after.oportunidades_started, 9);
  assert.equal(r.after.outcome_hired, 1);
  assert.equal(r.after.cv_downloaded, 0);       // sin histórico → 0, no inventa
  assert.equal(r.earliestDay, '2026-08-09');
  assert.equal(s.data.get('totales/cv_generated'), '5');
  assert.ok(s.data.has('migraciones/backfill-totales'));
});

test('backfillTotals es idempotente: correrlo dos veces da el mismo resultado', async () => {
  const s = fakeStoreWithList();
  _setStoreForTests(() => s);
  s.data.set('2026-08-12/job_matches_shown', '12');
  s.data.set('2026-08-13/job_matches_shown', '7');

  const { backfillTotals } = await import('../netlify/functions/lib/track.mjs');
  const r1 = await backfillTotals();
  const r2 = await backfillTotals();
  assert.equal(r1.after.job_matches_shown, 19);
  assert.equal(r2.after.job_matches_shown, 19); // NO 38
  assert.equal(s.data.get('totales/job_matches_shown'), '19');
});

test('tras el backfill, todo acumulado es ≥ que el contador de hoy', async () => {
  const s = fakeStoreWithList();
  _setStoreForTests(() => s);
  const today = new Date().toISOString().slice(0, 10);
  s.data.set(`${today}/cv_generated`, '2');
  s.data.set('2026-08-09/cv_generated', '3');

  const { backfillTotals, getStats } = await import('../netlify/functions/lib/track.mjs');
  await backfillTotals();
  const stats = await getStats();
  for (const e of Object.keys(stats.totals)) {
    assert.ok(stats.totals[e] >= stats.today[e], `${e}: total ${stats.totals[e]} < hoy ${stats.today[e]}`);
  }
  assert.equal(stats.totals.cv_generated, 5);
  assert.equal(stats.today.cv_generated, 2);
});
