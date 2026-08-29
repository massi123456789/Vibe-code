// TEMPORAL — SE ELIMINA DESPUÉS DE LA MIGRACIÓN ÚNICA.
// Recalcula los acumulados de por vida sumando los contadores diarios reales
// de Netlify Blobs. Es idempotente (recalcula, no suma encima) y no expone
// ni acepta ningún dato personal: solo devuelve totales anónimos agregados.
// POST-only y con rate limit. La versión permanente y protegida por token
// vive en admin-stats (?action=backfill).

import { backfillTotals, getStats } from './lib/track.mjs';
import { allowRequest, clientIp } from './lib/rate-limit.mjs';

export default async (request, context) => {
  if (request.method !== 'POST') return new Response('Not Found', { status: 404 });
  if (!allowRequest(`migrate:${clientIp(request, context)}`, { max: 5, windowMs: 10 * 60 * 1000 })) {
    return new Response('Too Many Requests', { status: 429 });
  }
  try {
    const result = await backfillTotals();
    const stats = await getStats();
    const violations = Object.keys(stats.totals)
      .filter((e) => stats.totals[e] < stats.today[e]);
    return new Response(JSON.stringify({ ...result, verify: { totalsAtLeastToday: violations.length === 0, violations, today: stats.today } }, null, 2), {
      status: 200,
      headers: { 'content-type': 'application/json', 'cache-control': 'no-store', 'x-robots-tag': 'noindex' },
    });
  } catch {
    return new Response(JSON.stringify({ ok: false, error: 'Blobs no disponible' }), { status: 503 });
  }
};
