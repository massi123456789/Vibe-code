// Cliente de las funciones server-side. Ninguna clave vive acá:
// el navegador solo habla con /.netlify/functions/*.

const BASE = '/.netlify/functions';

async function postJson(path, body) {
  let res;
  try {
    res = await fetch(`${BASE}/${path}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
  } catch {
    throw new Error('No hay conexión. Revisá tu internet y probá de nuevo.');
  }
  let data = null;
  try { data = await res.json(); } catch { /* respuesta sin JSON */ }
  if (!res.ok) {
    throw new Error(data?.error || 'Algo salió mal. Probá nuevamente en un rato.');
  }
  return data;
}

/** Genera el CV estructurado a partir del intake. */
export function generateCv(intake) {
  return postJson('generate-cv', intake);
}

/** Busca y rankea ofertas a partir del perfil compacto. */
export function searchJobs(profile) {
  return postJson('search-jobs', profile);
}

/**
 * Evento de impacto anónimo (fire-and-forget, jamás rompe la UX).
 * Solo se manda el nombre del evento, nunca datos personales.
 */
export function trackEvent(event) {
  try {
    const payload = JSON.stringify({ event });
    if (navigator.sendBeacon) {
      navigator.sendBeacon(`${BASE}/track-event`, new Blob([payload], { type: 'application/json' }));
    } else {
      fetch(`${BASE}/track-event`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: payload,
        keepalive: true,
      }).catch(() => {});
    }
  } catch { /* nunca romper por analytics */ }
}
