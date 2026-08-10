// Integración con Jooble (fuente inicial de ofertas).
// Documentación: https://jooble.org/api/about — POST https://{país}.jooble.org/api/{key}
// El host lleva el país donde se registró la key (Argentina = ar.jooble.org);
// se puede cambiar con JOOBLE_API_HOST sin tocar código.
// La cuota es limitada (~500 requests iniciales): UNA sola llamada por búsqueda,
// con suficientes resultados para rankear localmente/IA. Nunca paginar en loop.

import { CONFIG } from './config.mjs';
import { suggestAccessibleTerm } from './level.mjs';

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
 * Búsqueda más amplia para cuando el término exacto no encuentra nada.
 * Primero intenta una categoría accesible derivada de lo que la persona
 * realmente contó (ej. skills "cocinar" → "ayudante de cocina"); si nada
 * de su perfil matchea, busca solo por ubicación y el ranking ordena.
 */
export function buildBroaderQuery(profile) {
  const { location } = buildSearchQuery(profile);
  return { keywords: suggestAccessibleTerm(profile), location };
}

/**
 * Una llamada real a Jooble. Devuelve la lista normalizada de ofertas.
 * La clave vive SOLO en JOOBLE_API_KEY.
 * queryOverride permite pasar una query ya armada (p. ej. la ampliada).
 */
export async function searchJooble(profile, queryOverride) {
  const apiKey = process.env.JOOBLE_API_KEY;
  if (!apiKey) throw Object.assign(new Error('JOOBLE_API_KEY no configurada'), { status: 503 });

  const host = process.env.JOOBLE_API_HOST || 'https://ar.jooble.org';
  const { keywords, location } = queryOverride || buildSearchQuery(profile);
  // datecreatedfrom: pedirle a Jooble solo ofertas recientes (si el parámetro
  // no está soportado lo ignora y filtramos igual por fecha del lado nuestro).
  const fromDate = new Date(Date.now() - CONFIG.MAX_JOB_AGE_DAYS * 86400_000)
    .toISOString().slice(0, 10);
  const res = await fetch(`${host}/api/${apiKey}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      keywords,
      location,
      ResultOnPage: CONFIG.JOOBLE_RESULTS_PER_CALL,
      page: 1,
      datecreatedfrom: fromDate,
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
export function normalizeJoobleJob(raw, idx = 0, now = Date.now()) {
  const strip = (s) => (typeof s === 'string' ? s.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim() : '');
  const updated = strip(raw?.updated);
  return {
    id: String(raw?.id ?? `jooble-${idx}`),
    title: strip(raw?.title),
    company: strip(raw?.company),
    location: strip(raw?.location),
    snippet: strip(raw?.snippet).slice(0, 280),
    salary: strip(raw?.salary),
    url: typeof raw?.link === 'string' && /^https?:\/\//i.test(raw.link) ? raw.link : '',
    source: strip(raw?.source),
    updated,
    updatedDays: updatedDaysAgo(updated, now),
  };
}

/** Días desde la última actualización de la oferta, o null si no se sabe. */
export function updatedDaysAgo(updated, now = Date.now()) {
  if (!updated) return null;
  const t = Date.parse(updated);
  if (Number.isNaN(t)) return null;
  const days = Math.floor((now - t) / 86400_000);
  return days < 0 ? 0 : days;
}

/**
 * Filtra ofertas demasiado viejas (probablemente vencidas). Las que no
 * informan fecha se conservan: no podemos verificar y no queremos vaciar
 * la búsqueda; el ranking igual las desprioriza frente a las recientes.
 * Jooble NO informa si una oferta sigue vigente: esto reduce el riesgo de
 * links muertos, no lo elimina — por eso nunca afirmamos disponibilidad.
 */
export function filterFreshJobs(jobs, maxAgeDays = CONFIG.MAX_JOB_AGE_DAYS) {
  return jobs.filter((j) => j.updatedDays === null || j.updatedDays <= maxAgeDays);
}
