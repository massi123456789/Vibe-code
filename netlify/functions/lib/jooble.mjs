// Integración con Jooble (fuente inicial de ofertas).
// Documentación: https://jooble.org/api/about — POST https://{país}.jooble.org/api/{key}
// El host lleva el país donde se registró la key (Argentina = ar.jooble.org);
// se puede cambiar con JOOBLE_API_HOST sin tocar código.
// La cuota es limitada (~500 requests iniciales): UNA sola llamada por búsqueda,
// con suficientes resultados para rankear localmente/IA. Nunca paginar en loop.

import { CONFIG } from './config.mjs';

/**
 * Deriva términos de búsqueda concisos a partir del perfil real.
 * NO manda el CV entero: una frase corta basada en el trabajo buscado
 * (lo que la persona pidió explícitamente) — nunca categorías inventadas.
 */
export function buildSearchQuery(profile) {
  // El trabajo buscado es la señal más directa; tomamos el primer término
  // significativo si la persona listó varios ("atención al cliente, ventas").
  const first = (profile.desiredWork || '')
    .split(/[,;/·]| o | y /i)
    .map((s) => s.trim())
    .filter(Boolean)[0] || '';
  const keywords = first.slice(0, 60);

  // Ubicación: Jooble espera texto libre; normalizamos CABA a algo que entienda.
  let location = profile.location || 'Argentina';
  if (/^caba$|capital federal/i.test(location.trim())) {
    location = 'Buenos Aires';
  }
  return { keywords, location };
}

/**
 * Una llamada real a Jooble. Devuelve la lista normalizada de ofertas.
 * La clave vive SOLO en JOOBLE_API_KEY.
 */
export async function searchJooble(profile) {
  const apiKey = process.env.JOOBLE_API_KEY;
  if (!apiKey) throw Object.assign(new Error('JOOBLE_API_KEY no configurada'), { status: 503 });

  const host = process.env.JOOBLE_API_HOST || 'https://jooble.org';
  const { keywords, location } = buildSearchQuery(profile);
  const res = await fetch(`${host}/api/${apiKey}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      keywords,
      location,
      ResultOnPage: CONFIG.JOOBLE_RESULTS_PER_CALL,
      page: 1,
    }),
  });
  if (!res.ok) {
    throw Object.assign(new Error(`Jooble respondió ${res.status} (host ${host.replace('https://', '')})`), { status: 502 });
  }
  const data = await res.json();
  const rawJobs = Array.isArray(data?.jobs) ? data.jobs : [];
  return {
    jobs: rawJobs.map(normalizeJoobleJob).filter((j) => j.title && j.url),
    totalCount: Number(data?.totalCount) || rawJobs.length,
  };
}

/** Normaliza una oferta cruda de Jooble a nuestro formato interno. */
export function normalizeJoobleJob(raw, idx = 0) {
  const strip = (s) => (typeof s === 'string' ? s.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim() : '');
  return {
    id: String(raw?.id ?? `jooble-${idx}`),
    title: strip(raw?.title),
    company: strip(raw?.company),
    location: strip(raw?.location),
    snippet: strip(raw?.snippet).slice(0, 280),
    salary: strip(raw?.salary),
    url: typeof raw?.link === 'string' && /^https?:\/\//i.test(raw.link) ? raw.link : '',
    source: strip(raw?.source),
    updated: strip(raw?.updated),
  };
}
