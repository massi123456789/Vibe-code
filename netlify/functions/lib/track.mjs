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
