// Configuración central de las funciones server-side.
// Los modelos se pueden cambiar por variable de entorno sin tocar código.

export const CONFIG = {
  // Modelo para redactar el CV (escritura estructurada, costo-eficiente).
  CV_MODEL: process.env.OPENAI_CV_MODEL || 'gpt-4o-mini',
  // Modelo para rankear ofertas (tarea más simple; puede ser aún más barato).
  RANK_MODEL: process.env.OPENAI_RANK_MODEL || 'gpt-4o-mini',

  MAX_CV_OUTPUT_TOKENS: 1600,
  // 12 ofertas × (id largo + categoría + razón + traducción de título) puede
  // superar 900 tokens; si el JSON se trunca, se pierde el ranking de IA.
  MAX_RANK_OUTPUT_TOKENS: 1800,

  // Cuántas ofertas de Jooble pedimos en UNA llamada (rankeamos localmente/IA,
  // nunca paginamos en loop — la cuota es limitada).
  JOOBLE_RESULTS_PER_CALL: 30,
  // Máximo de ofertas que mandamos a la IA para rankear (control de costo).
  MAX_JOBS_TO_RANK: 12,
  // Máximo de ofertas que devolvemos al navegador.
  MAX_JOBS_RETURNED: 12,

  // Throttling best-effort por instancia (sin infraestructura extra).
  RATE_LIMITS: {
    'generate-cv': { max: 6, windowMs: 10 * 60 * 1000 },
    'search-jobs': { max: 8, windowMs: 10 * 60 * 1000 },
    'track-event': { max: 60, windowMs: 10 * 60 * 1000 },
  },

  // Tope duro del body de cualquier request (bytes).
  MAX_BODY_BYTES: 30_000,
};

export const MOCK_AI = !process.env.OPENAI_API_KEY || process.env.MOCK_AI === '1';
export const MOCK_JOBS = !process.env.JOOBLE_API_KEY || process.env.MOCK_JOBS === '1';
