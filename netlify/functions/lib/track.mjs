// Eventos de impacto anónimos y agregados.
// SOLO se acepta el nombre del evento — nunca nombres, emails, teléfonos,
// texto de CV ni historias laborales. Contadores diarios en Netlify Blobs;
// si Blobs no está disponible, se registra en el log de la función y listo
// (no bloqueamos el producto por analytics).

export const ALLOWED_EVENTS = new Set([
  'oportunidades_started',
  'intake_completed',
  'cv_generated',
  'cv_downloaded',
  'job_search_completed',
  'job_listing_clicked',
  // Resultados AUTO-REPORTADOS por la persona (no verificados independientemente).
  'outcome_application',
  'outcome_interview',
  'outcome_hired',
  'outcome_not_yet',
]);

/**
 * Incrementa el contador diario del evento. Nunca lanza: analytics jamás
 * debe romper la experiencia del usuario.
 */
export async function recordEvent(eventName, now = new Date()) {
  if (!ALLOWED_EVENTS.has(eventName)) return { ok: false, reason: 'evento desconocido' };
  const day = now.toISOString().slice(0, 10);
  const key = `${day}/${eventName}`;

  try {
    const { getStore } = await import('@netlify/blobs');
    const store = getStore('impacto');
    const current = Number(await store.get(key)) || 0;
    await store.set(key, String(current + 1));
    return { ok: true, storage: 'blobs' };
  } catch {
    // Fallback: log estructurado (visible en logs de Netlify, sin PII).
    console.log(JSON.stringify({ impactEvent: eventName, day }));
    return { ok: true, storage: 'log' };
  }
}
