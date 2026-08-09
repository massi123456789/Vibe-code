// POST /.netlify/functions/generate-cv
// Recibe el intake validado y devuelve el CV estructurado (JSON).
// Con OPENAI_API_KEY usa IA (con reglas estrictas de no-fabricación);
// sin key o con MOCK_AI=1 devuelve un CV determinístico basado solo en
// lo que la persona escribió (marcado con mock:true).

import { CONFIG, MOCK_AI } from './lib/config.mjs';
import { readJsonBody, validateIntake } from './lib/validate.mjs';
import { CV_JSON_SCHEMA, CV_SYSTEM_PROMPT, buildCvUserPrompt, normalizeCv } from './lib/cv-schema.mjs';
import { callOpenAIJson } from './lib/openai.mjs';
import { mockCvFromIntake } from './lib/mock.mjs';
import { allowRequest, clientIp } from './lib/rate-limit.mjs';

const json = (body, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

export default async (request, context) => {
  if (request.method !== 'POST') return json({ error: 'Método no permitido' }, 405);

  if (!allowRequest(`generate-cv:${clientIp(request, context)}`, CONFIG.RATE_LIMITS['generate-cv'])) {
    return json({ error: 'Demasiadas solicitudes. Esperá unos minutos y probá de nuevo.' }, 429);
  }

  let raw;
  try {
    raw = await readJsonBody(request, CONFIG.MAX_BODY_BYTES);
  } catch (err) {
    return json({ error: err.message }, err.status || 400);
  }

  const { ok, errors, intake } = validateIntake(raw);
  if (!ok) return json({ error: 'Datos incompletos o inválidos.', details: errors }, 400);

  if (MOCK_AI) {
    return json({ cv: normalizeCv(mockCvFromIntake(intake), intake), mock: true });
  }

  try {
    const aiCv = await callOpenAIJson({
      model: CONFIG.CV_MODEL,
      system: CV_SYSTEM_PROMPT,
      user: buildCvUserPrompt(intake),
      schema: CV_JSON_SCHEMA,
      maxTokens: CONFIG.MAX_CV_OUTPUT_TOKENS,
    });
    return json({ cv: normalizeCv(aiCv, intake), mock: false });
  } catch (err) {
    console.error('generate-cv error:', err.message);
    return json({
      error: 'No pudimos generar tu CV en este momento. Tus respuestas siguen acá. Probá nuevamente.',
    }, err.status || 502);
  }
};
