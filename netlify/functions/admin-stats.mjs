// GET /.netlify/functions/admin-stats?token=...
// Panel privado de métricas de impacto (solo totales anónimos y agregados).
// Protegido por la variable de entorno ADMIN_STATS_TOKEN:
//   - sin la variable configurada → 404 (el panel no existe)
//   - token incorrecto o ausente → 404 (no revelamos que existe)
// No está linkeado desde ninguna página y lleva noindex.
// Con ?format=json devuelve JSON en vez de HTML.

import { getStats } from './lib/track.mjs';
import { allowRequest, clientIp } from './lib/rate-limit.mjs';

const notFound = () => new Response('Not Found', { status: 404, headers: { 'content-type': 'text/plain' } });

// Comparación de largo constante (evita timing attacks básicos).
function tokenMatches(given, expected) {
  if (typeof given !== 'string' || !given || !expected) return false;
  const enc = new TextEncoder();
  const a = enc.encode(given);
  const b = enc.encode(expected);
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
  return diff === 0;
}

const MAIN_METRICS = [
  ['job_search_completed', 'Búsquedas de trabajo completadas', 'Cada vez que a una persona se le mostraron resultados rankeados (las búsquedas con 0 resultados no cuentan).'],
  ['job_matches_shown', 'Ofertas mostradas en total', 'Suma de las tarjetas de oferta efectivamente mostradas en esas búsquedas.'],
  ['cv_generated', 'CVs generados', 'Solo generaciones exitosas.'],
  ['job_listing_clicked', 'Clicks en "Ver oportunidad"', 'Clicks reales en el link externo de una oferta.'],
];

const EXTRA_LABELS = {
  oportunidades_started: 'Empezaron el flujo',
  intake_completed: 'Completaron el formulario',
  cv_downloaded: 'CVs descargados en PDF',
  outcome_application: 'Reportaron: me postulé',
  outcome_interview: 'Reportaron: conseguí entrevista',
  outcome_hired: 'Reportaron: conseguí trabajo',
  outcome_not_yet: 'Reportaron: todavía no',
};

export default async (request, context) => {
  const expected = process.env.ADMIN_STATS_TOKEN;
  if (!expected) return notFound();
  if (request.method !== 'GET') return notFound();
  if (!allowRequest(`admin-stats:${clientIp(request, context)}`, { max: 30, windowMs: 10 * 60 * 1000 })) {
    return notFound();
  }

  const url = new URL(request.url);
  const given = url.searchParams.get('token') || request.headers.get('x-admin-token') || '';
  if (!tokenMatches(given, expected)) return notFound();

  // Chequeo de salud del almacenamiento: escribe y lee un valor de prueba
  // solo si se pide explícitamente (?health=1), para no ensuciar contadores.
  const stats = await getStats();

  if (url.searchParams.get('format') === 'json') {
    return new Response(JSON.stringify(stats, null, 2), {
      status: 200,
      headers: { 'content-type': 'application/json', 'cache-control': 'no-store', 'x-robots-tag': 'noindex' },
    });
  }

  const fmt = (n) => Number(n || 0).toLocaleString('es-AR');
  const mainCards = MAIN_METRICS.map(([key, label, desc]) => `
    <div class="card">
      <div class="num">${fmt(stats.totals[key])}</div>
      <div class="lbl">${label}</div>
      <div class="today">hoy: ${fmt(stats.today[key])}</div>
      <p class="desc">${desc}</p>
    </div>`).join('');

  const extraRows = Object.entries(EXTRA_LABELS).map(([key, label]) => `
    <tr><td>${label}</td><td class="r">${fmt(stats.totals[key])}</td><td class="r">${fmt(stats.today[key])}</td></tr>`).join('');

  const html = `<!DOCTYPE html>
<html lang="es-AR">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<meta name="robots" content="noindex, nofollow">
<title>EconoChori · Métricas de impacto</title>
<style>
  body{font-family:system-ui,-apple-system,sans-serif;background:#FBF7F0;color:#1F2C49;margin:0;padding:24px;line-height:1.5}
  .wrap{max-width:760px;margin:0 auto}
  h1{font-size:1.5rem;margin:0 0 .2rem}
  .sub{color:#4a5673;font-size:.9rem;margin-bottom:1.4rem}
  .grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:14px;margin-bottom:1.6rem}
  .card{background:#fff;border:1px solid #E7DDCB;border-radius:14px;padding:18px}
  .num{font-size:2.2rem;font-weight:800;color:#FA9302;line-height:1}
  .lbl{font-weight:700;margin-top:.4rem}
  .today{font-size:.8rem;color:#006EBA;font-weight:600;margin-top:.15rem}
  .desc{font-size:.78rem;color:#4a5673;margin:.4rem 0 0}
  table{width:100%;border-collapse:collapse;background:#fff;border:1px solid #E7DDCB;border-radius:14px;overflow:hidden}
  th,td{padding:.55rem .9rem;border-bottom:1px solid #E7DDCB;text-align:left;font-size:.9rem}
  th{background:#F4ECDE;font-size:.78rem;text-transform:uppercase;letter-spacing:.05em}
  td.r,th.r{text-align:right}
  tr:last-child td{border-bottom:none}
  .foot{font-size:.78rem;color:#4a5673;margin-top:1.2rem}
  .warn{background:#fdf0ef;border:1px solid #f0cfcc;color:#B3261E;border-radius:10px;padding:10px 14px;font-size:.88rem;margin-bottom:1rem}
</style>
</head>
<body>
<div class="wrap">
  <h1>EconoChori Oportunidades · Métricas de impacto</h1>
  <p class="sub">Totales acumulados (anónimos) · hoy = ${stats.day} · almacenamiento: ${stats.storage}</p>
  ${stats.storage !== 'blobs' ? '<div class="warn">⚠️ Netlify Blobs no está disponible: los contadores no se están persistiendo. Revisar la configuración del sitio.</div>' : ''}
  <div class="grid">${mainCards}</div>
  <table>
    <thead><tr><th>Otros eventos</th><th class="r">Total</th><th class="r">Hoy</th></tr></thead>
    <tbody>${extraRows}</tbody>
  </table>
  <p class="foot">Solo contadores agregados: sin nombres, emails, IPs ni contenido de CVs. Los resultados reportados por las personas no están verificados independientemente. Actualizá la página para refrescar.</p>
</div>
</body>
</html>`;

  return new Response(html, {
    status: 200,
    headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store', 'x-robots-tag': 'noindex' },
  });
};
