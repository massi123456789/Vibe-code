// POST /.netlify/functions/search-jobs
// Recibe el perfil compacto, hace UNA búsqueda en Jooble (o mocks) y
// devuelve las ofertas rankeadas. El ranking usa IA si hay OPENAI_API_KEY;
// si la IA falla o no está, cae al ranking determinístico por keywords.
// Nunca se modifica título/empresa/URL de las ofertas originales.

import { CONFIG, MOCK_AI, MOCK_JOBS as USE_MOCK_JOBS } from './lib/config.mjs';
import { readJsonBody, validateJobProfile } from './lib/validate.mjs';
import { searchJooble } from './lib/jooble.mjs';
import { MOCK_JOBS } from './lib/mock.mjs';
import { keywordRank, sanitizeAiRanking, RANK_JSON_SCHEMA, RANK_SYSTEM_PROMPT, buildRankUserPrompt } from './lib/rank.mjs';
import { callOpenAIJson } from './lib/openai.mjs';
import { allowRequest, clientIp } from './lib/rate-limit.mjs';

const json = (body, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

export default async (request, context) => {
  if (request.method !== 'POST') return json({ error: 'Método no permitido' }, 405);

  if (!allowRequest(`search-jobs:${clientIp(request, context)}`, CONFIG.RATE_LIMITS['search-jobs'])) {
    return json({ error: 'Demasiadas búsquedas. Esperá unos minutos y probá de nuevo.' }, 429);
  }

  let raw;
  try {
    raw = await readJsonBody(request, CONFIG.MAX_BODY_BYTES);
  } catch (err) {
    return json({ error: err.message }, err.status || 400);
  }

  const { ok, errors, profile } = validateJobProfile(raw);
  if (!ok) return json({ error: 'Datos incompletos o inválidos.', details: errors }, 400);

  // 1) Conseguir ofertas (mock en desarrollo para cuidar la cuota de Jooble).
  let jobs;
  let totalCount = 0;
  let diag;
  let mock = false;
  if (USE_MOCK_JOBS) {
    jobs = MOCK_JOBS;
    totalCount = MOCK_JOBS.length;
    mock = true;
  } else {
    try {
      ({ jobs, totalCount, diag } = await searchJooble(profile));
    } catch (err) {
      console.error('search-jobs (jooble) error:', err.message);
      return json({
        error: 'No pudimos buscar oportunidades en este momento. Tu CV ya está listo y podés volver a intentar la búsqueda.',
        detail: err.message,
      }, err.status || 502);
    }
  }

  if (!jobs.length) {
    return json({ jobs: [], mock, totalCount, diag, message: 'No encontramos suficientes oportunidades con esta búsqueda. Probemos con una búsqueda un poco más amplia.' });
  }

  // 2) Rankear: primero con IA (pocas ofertas, prompt corto); fallback keywords.
  const toRank = jobs.slice(0, CONFIG.MAX_JOBS_TO_RANK);
  let ranked;
  if (!MOCK_AI) {
    try {
      const aiOutput = await callOpenAIJson({
        model: CONFIG.RANK_MODEL,
        system: RANK_SYSTEM_PROMPT,
        user: buildRankUserPrompt(profile, toRank),
        schema: RANK_JSON_SCHEMA,
        maxTokens: CONFIG.MAX_RANK_OUTPUT_TOKENS,
      });
      ranked = sanitizeAiRanking(aiOutput, toRank);
    } catch (err) {
      console.error('search-jobs (ranking IA) error:', err.message);
      ranked = keywordRank(profile, toRank);
    }
  } else {
    ranked = keywordRank(profile, toRank);
  }

  return json({ jobs: ranked.slice(0, CONFIG.MAX_JOBS_RETURNED), mock, totalCount });
};
