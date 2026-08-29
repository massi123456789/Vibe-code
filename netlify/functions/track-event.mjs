// POST /.netlify/functions/track-event
// Registra un evento de impacto anónimo. Body: {"event": "cv_generated"}
// o {"event": "job_matches_shown", "count": 7} (count solo para ese evento).
// Se ignora cualquier otro campo: acá no entra PII bajo ningún concepto.

import { CONFIG } from './lib/config.mjs';
import { readJsonBody } from './lib/validate.mjs';
import { recordEvent, ALLOWED_EVENTS, COUNT_EVENTS } from './lib/track.mjs';
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

  // count solo para eventos que lo admiten; para el resto siempre 1.
  const count = COUNT_EVENTS.has(event) ? raw?.count : 1;
  const result = await recordEvent(event, count);
  return json({ ok: true, storage: result.storage });
};
