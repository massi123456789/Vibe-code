// POST /.netlify/functions/track-event
// Registra un evento de impacto anónimo. Body: {"event": "cv_generated"}.
// Se ignora cualquier otro campo: acá no entra PII bajo ningún concepto.

import { CONFIG } from './lib/config.mjs';
import { readJsonBody } from './lib/validate.mjs';
import { recordEvent, ALLOWED_EVENTS } from './lib/track.mjs';
import { allowRequest, clientIp } from './lib/rate-limit.mjs';

const json = (body, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

export default async (request, context) => {
  if (request.method !== 'POST') return json({ error: 'Método no permitido' }, 405);

  if (!allowRequest(`track-event:${clientIp(request, context)}`, CONFIG.RATE_LIMITS['track-event'])) {
    return json({ ok: false }, 429);
  }

  let raw;
  try {
    raw = await readJsonBody(request, 1000);
  } catch (err) {
    return json({ error: err.message }, err.status || 400);
  }

  const event = typeof raw?.event === 'string' ? raw.event.slice(0, 50) : '';
  if (!ALLOWED_EVENTS.has(event)) return json({ error: 'Evento desconocido' }, 400);

  await recordEvent(event);
  return json({ ok: true });
};
