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
