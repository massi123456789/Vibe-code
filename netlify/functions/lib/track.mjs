// Eventos de impacto anónimos y agregados.
// SOLO se acepta el nombre del evento (y un contador chico para
// job_matches_shown) — nunca nombres, emails, IPs, texto de CV ni historias
// laborales. Persistencia en Netlify Blobs (sobrevive deploys y la retención
// de 7 días de los logs): un contador por día (`YYYY-MM-DD/evento`) y un
// acumulado de por vida (`totales/evento`). Si Blobs no está disponible se
// registra en el log y listo: analytics jamás rompe la experiencia.

export const ALLOWED_EVENTS = new Set([
  'oportunidades_started',
  'intake_completed',
  'cv_generated',
  'cv_downloaded',
  'job_search_completed',
  'job_matches_shown',
  'job_listing_clicked',
  // Resultados AUTO-REPORTADOS por la persona (no verificados independientemente).
  'outcome_application',
  'outcome_interview',
  'outcome_hired',
  'outcome_not_yet',
]);

// Únicos eventos que pueden traer un contador > 1 (cantidad de ofertas
// mostradas en una búsqueda). Tope defensivo contra abuso.
export const COUNT_EVENTS = new Set(['job_matches_shown']);
export const MAX_EVENT_COUNT = 50;

// Inyección para tests (Blobs no existe fuera de Netlify).
let storeFactory = null;
export function _setStoreForTests(factory) { storeFactory = factory; }

async function getImpactStore() {
  if (storeFactory) return storeFactory();
  const { getStore } = await import('@netlify/blobs');
  return getStore('impacto');
}

/**
 * Suma `count` al contador diario y al acumulado del evento. Nunca lanza.
 * Nota: get+set no es atómico; bajo alta concurrencia un incremento podría
 * perderse. Para métricas de impacto de esta escala es aceptable.
 */
export async function recordEvent(eventName, count = 1, now = new Date()) {
  if (!ALLOWED_EVENTS.has(eventName)) return { ok: false, reason: 'evento desconocido' };
  const n = COUNT_EVENTS.has(eventName)
    ? Math.min(Math.max(Math.floor(Number(count)) || 1, 1), MAX_EVENT_COUNT)
    : 1;
  const day = now.toISOString().slice(0, 10);

  try {
    const store = await getImpactStore();
    const bump = async (key) => {
      const current = Number(await store.get(key)) || 0;
      await store.set(key, String(current + n));
    };
    await bump(`${day}/${eventName}`);
    await bump(`totales/${eventName}`);
    return { ok: true, storage: 'blobs', added: n };
  } catch {
    // Fallback: log estructurado (visible en logs de Netlify, sin PII).
    console.log(JSON.stringify({ impactEvent: eventName, day, count: n }));
    return { ok: true, storage: 'log', added: n };
  }
}

const DAY_KEY_RE = /^(\d{4}-\d{2}-\d{2})\/(.+)$/;

async function listAllKeys(store) {
  // La API real pagina con list({paginate:true}) (iterable asíncrono);
  // también soportamos un list() simple que devuelve {blobs:[...]}.
  const keys = [];
  const result = await store.list({ paginate: true });
  if (result && typeof result[Symbol.asyncIterator] === 'function') {
    for await (const page of result) {
      for (const b of page.blobs || []) keys.push(b.key);
    }
  } else {
    for (const b of result?.blobs || []) keys.push(b.key);
  }
  return keys;
}

/**
 * Migración/reparación idempotente: RECALCULA cada acumulado de por vida
 * como la suma de todos sus contadores diarios (la fuente de verdad, que
 * existe desde el primer día). No estima nada: solo suma lo almacenado.
 * Correrla dos veces da el mismo resultado (recalcula, no suma encima).
 */
export async function backfillTotals(now = new Date()) {
  const store = await getImpactStore();

  const keys = await listAllKeys(store);
  const sums = {};
  for (const e of ALLOWED_EVENTS) sums[e] = 0;
  let earliestDay = null;
  let dayKeysMatched = 0;

  for (const key of keys) {
    const m = key.match(DAY_KEY_RE);
    if (!m || !ALLOWED_EVENTS.has(m[2])) continue;
    const value = Number(await store.get(key)) || 0;
    sums[m[2]] += value;
    dayKeysMatched += 1;
    if (value > 0 && (!earliestDay || m[1] < earliestDay)) earliestDay = m[1];
  }

  const before = {};
  const after = {};
  for (const e of ALLOWED_EVENTS) {
    before[e] = Number(await store.get(`totales/${e}`)) || 0;
    await store.set(`totales/${e}`, String(sums[e]));
    after[e] = sums[e];
  }

  await store.set('migraciones/backfill-totales', JSON.stringify({
    ranAt: now.toISOString(),
    earliestDay,
    dayKeysMatched,
    after,
  }));

  return { ok: true, before, after, earliestDay, dayKeysMatched };
}

/**
 * Lee los acumulados de por vida y los contadores de hoy para todos los
 * eventos permitidos. Devuelve ceros si Blobs no está disponible.
 */
export async function getStats(now = new Date()) {
  const day = now.toISOString().slice(0, 10);
  const totals = {};
  const today = {};
  let storage = 'blobs';
  try {
    const store = await getImpactStore();
    for (const event of ALLOWED_EVENTS) {
      totals[event] = Number(await store.get(`totales/${event}`)) || 0;
      today[event] = Number(await store.get(`${day}/${event}`)) || 0;
    }
  } catch {
    storage = 'unavailable';
    for (const event of ALLOWED_EVENTS) { totals[event] = 0; today[event] = 0; }
  }
  return { totals, today, storage, day };
}
