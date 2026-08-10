// Ranking de ofertas contra el perfil del usuario.
// 1) scoreJob/keywordRank: determinístico (relevancia + nivel + frescura).
// 2) preselectJobs: elige qué ofertas van a la IA (las más aptas primero).
// 3) sanitizeAiRanking: valida la salida de la IA — solo puede referirse a
//    ofertas realmente provistas, jamás inventar ni modificar datos; aplica
//    una guarda determinística de nivel y garantiza razón en cada oferta.

import { CONFIG } from './config.mjs';
import { inferProfileLevel, jobLevel } from './level.mjs';

export const CATEGORIES = ['muy-compatible', 'compatible', 'podria-interesarte'];

export const RANK_JSON_SCHEMA = {
  name: 'ranking_ofertas',
  strict: true,
  schema: {
    type: 'object',
    additionalProperties: false,
    properties: {
      matches: {
        type: 'array',
        items: {
          type: 'object',
          additionalProperties: false,
          properties: {
            jobId: { type: 'string' },
            category: { type: 'string', enum: CATEGORIES },
            reason: {
              type: 'string',
              description: 'Frase corta (máx. 25 palabras) explicando por qué puede encajar, basada SOLO en lo que la persona contó y el texto real de la oferta. OBLIGATORIA en cada oferta.',
            },
            rank: { type: 'integer' },
            titleEs: {
              type: 'string',
              description: 'El título del puesto escrito en español, SIEMPRE. "Customer Service Representative" se escribe "Representante de Atención al Cliente"; "Cost Engineer" se escribe "Ingeniero/a de Costos". Un título que ya está en español se copia exacto. Solo el título: sin ubicación ni empresa.',
            },
          },
          required: ['jobId', 'category', 'reason', 'rank', 'titleEs'],
        },
      },
    },
    required: ['matches'],
  },
};

export const RANK_SYSTEM_PROMPT = `Ordenás ofertas de trabajo para una persona en Argentina según su perfil real. Español argentino, tono claro y respetuoso.

REGLAS:
- Solo podés rankear las ofertas provistas, identificadas por su jobId exacto. Jamás inventes ofertas ni cambies empresas, títulos o sueldos.
- "reason" es OBLIGATORIA para CADA oferta: una frase corta (máx. 25 palabras) que explique por qué puede encajar, basada SOLO en lo que la persona contó y el texto real de la oferta. Jamás le atribuyas experiencia, estudios, idiomas o habilidades que no mencionó.
- Nunca digas que la persona está garantizada a calificar o a ser contratada.
- category: "muy-compatible" solo con coincidencia clara de experiencia/habilidades Y nivel adecuado; "compatible" con coincidencia parcial; "podria-interesarte" si es plausible como puesto de entrada cercano.
- EL NIVEL IMPORTA: si el perfil indica poca experiencia formal, priorizá puestos accesibles (ayudante, repositor/a, atención al cliente, ventas, limpieza, gastronomía, depósito, operario/a) y mandá al final, como "podria-interesarte" como máximo, los puestos con señales de seniority (Senior, Lead, Manager, Engineer, Specialist, título universitario requerido, varios años de experiencia exigidos). Si el perfil tiene estudios o experiencia profesional real, recomendá puestos de ese nivel con normalidad.
- rank: 1 = mejor. Incluí todas las ofertas provistas.
- titleEs: escribí el título del puesto EN ESPAÑOL, siempre. Nada de títulos en inglés en titleEs: "Warehouse Coordinator" → "Coordinador/a de Depósito", "In Store Specialist" → "Especialista de Tienda". Mantené siglas usuales (IT, RRHH, Excel). Traducción fiel: sin cambiar el nivel del puesto, sin agregar ubicación ni empresa.`;

const LEVEL_DESCRIPTIONS = {
  entry: 'poca o ninguna experiencia formal: priorizá puestos accesibles y de entrada',
  intermediate: 'experiencia en oficios o tareas administrativas: puestos operativos y semi-calificados',
  professional: 'formación o experiencia profesional: puestos acordes a ese nivel son bienvenidos',
};

/** Prompt de usuario compacto para el ranking. */
export function buildRankUserPrompt(profile, jobs) {
  const level = inferProfileLevel(profile);
  const p = [
    `Perfil real:`,
    `- Busca: ${profile.desiredWork}`,
    profile.skills ? `- Habilidades: ${profile.skills}` : '',
    profile.experienceSummary ? `- Experiencia: ${profile.experienceSummary}` : '',
    profile.educationLevel ? `- Estudios: ${profile.educationLevel}` : '',
    `- Zona: ${profile.location}`,
    profile.schedule && profile.schedule !== 'Cualquiera' ? `- Horario: ${profile.schedule}` : '',
    `- Nivel inferido del perfil: ${LEVEL_DESCRIPTIONS[level]}`,
    '',
    'Ofertas:',
  ].filter(Boolean);
  for (const j of jobs) {
    p.push(`[${j.id}] ${j.title}${j.company ? ` — ${j.company}` : ''} (${j.location}). ${j.snippet}`);
  }
  p.push('', 'Recordá: titleEs va SIEMPRE en español y reason es obligatoria en cada oferta.');
  return p.join('\n');
}

const STOPWORDS = new Set(['de', 'la', 'el', 'en', 'y', 'o', 'a', 'para', 'con', 'del', 'los', 'las', 'un', 'una', 'al', 'por', 'que', 'se']);

function tokens(text) {
  return (text || '')
    .toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .split(/[^a-zñ0-9]+/)
    .filter((t) => t.length > 2 && !STOPWORDS.has(t));
}

/**
 * Puntaje determinístico de una oferta para un perfil:
 * relevancia (coincidencia de palabras) + ajuste por nivel + frescura.
 */
export function scoreJob(profile, job, profileLevel = inferProfileLevel(profile)) {
  const profileTokens = new Set([
    ...tokens(profile.desiredWork),
    ...tokens(profile.skills),
    ...tokens(profile.experienceSummary),
  ]);
  const desired = new Set(tokens(profile.desiredWork));
  const jobTokens = new Set([...tokens(job.title), ...tokens(job.snippet)]);

  let relevance = 0;
  let desiredHit = false;
  for (const t of jobTokens) {
    if (desired.has(t)) { relevance += 3; desiredHit = true; }
    else if (profileTokens.has(t)) relevance += 1;
  }

  const { level: jl, accessible } = jobLevel(job);
  let levelAdjust = 0;
  if (profileLevel === 'entry') {
    if (jl === 'senior') levelAdjust = -8;      // puestos senior al final
    else if (accessible) levelAdjust = +3;      // puestos de entrada, adelante
  } else if (profileLevel === 'intermediate') {
    if (jl === 'senior') levelAdjust = -4;
    else if (accessible) levelAdjust = +1;
  } // professional: sin ajuste — recibe puestos de su nivel con normalidad

  let freshness = 0;
  if (job.updatedDays !== null && job.updatedDays !== undefined) {
    if (job.updatedDays > CONFIG.STALE_JOB_AGE_DAYS) freshness = -2;
  } else {
    freshness = -1; // sin fecha: leve despriorización frente a las verificables
  }

  return { score: relevance + levelAdjust + freshness, relevance, desiredHit, jobLevelInfo: { level: jl, accessible } };
}

/**
 * Razón de compatibilidad determinística (respaldo cuando la IA no dio una).
 * Solo afirma cosas derivadas de lo que la persona escribió.
 */
export function fallbackReason(profile, job) {
  const s = scoreJob(profile, job);
  if (s.desiredHit) return 'El puesto coincide con el tipo de trabajo que estás buscando.';
  if (s.relevance >= 2) return 'Algunas tareas del puesto coinciden con lo que contaste de tu experiencia o habilidades.';
  if (s.jobLevelInfo.accessible) return 'Es un puesto accesible en tu zona que no exige experiencia previa específica.';
  return 'Es una oportunidad en tu zona que podría interesarte, aunque pide un perfil distinto al tuyo.';
}

function categoryFor(profileLevel, s) {
  // Un puesto senior nunca es "muy compatible" para un perfil de entrada.
  const cap = profileLevel === 'entry' && s.jobLevelInfo.level === 'senior' ? 'podria-interesarte'
    : profileLevel === 'intermediate' && s.jobLevelInfo.level === 'senior' ? 'compatible'
    : null;
  const base = s.desiredHit && s.relevance >= 5 ? 'muy-compatible'
    : s.relevance >= 2 ? 'compatible'
    : 'podria-interesarte';
  if (!cap) return base;
  return CATEGORIES.indexOf(base) > CATEGORIES.indexOf(cap) ? base : cap;
}

/**
 * Ranking determinístico completo (fallback sin IA y preselección).
 * No inventa nada: solo ordena y categoriza las ofertas recibidas.
 */
export function keywordRank(profile, jobs) {
  const profileLevel = inferProfileLevel(profile);
  const scored = jobs.map((job) => {
    const s = scoreJob(profile, job, profileLevel);
    return { job, s };
  });
  scored.sort((a, b) => b.s.score - a.s.score);
  return scored.map(({ job, s }, i) => ({
    ...job,
    category: categoryFor(profileLevel, s),
    reason: fallbackReason(profile, job),
    titleEs: '', // sin IA no traducimos acá; ensureSpanishTitles cubre lo común
    rank: i + 1,
  }));
}

/**
 * Preselección determinística: de todas las ofertas frescas, elige las que
 * van a la IA (mejor puntaje primero). Así la IA rankea ofertas que ya son
 * relevantes, del nivel adecuado y recientes.
 */
export function preselectJobs(profile, jobs, max = CONFIG.MAX_JOBS_TO_RANK) {
  const profileLevel = inferProfileLevel(profile);
  return jobs
    .map((job) => ({ job, s: scoreJob(profile, job, profileLevel) }))
    .sort((a, b) => b.s.score - a.s.score)
    .slice(0, max)
    .map(({ job }) => job);
}

/**
 * Aplica el ranking de la IA a las ofertas reales.
 * - Ignora jobIds que no existen (la IA no puede inventar ofertas).
 * - Los datos de la oferta (título, empresa, URL, sueldo) salen SIEMPRE de la
 *   oferta original, nunca de la IA. La IA solo aporta categoría/razón/orden.
 * - Toda oferta mostrada tiene razón: si la IA no la dio, va la determinística.
 * - Guarda de nivel: con perfil de entrada, los puestos senior se degradan a
 *   "podria-interesarte" y van al final aunque la IA los haya puesto primeros.
 */
export function sanitizeAiRanking(aiOutput, jobs, profile) {
  const byId = new Map(jobs.map((j) => [j.id, j]));
  const seen = new Set();
  const ranked = [];
  const profileLevel = profile ? inferProfileLevel(profile) : null;

  const matches = Array.isArray(aiOutput?.matches) ? [...aiOutput.matches] : [];
  matches.sort((a, b) => (a?.rank ?? 999) - (b?.rank ?? 999));

  for (const m of matches) {
    const job = byId.get(String(m?.jobId));
    if (!job || seen.has(job.id)) continue;
    seen.add(job.id);
    const aiReason = typeof m.reason === 'string' ? m.reason.slice(0, 220).trim() : '';
    ranked.push({
      ...job,
      category: CATEGORIES.includes(m.category) ? m.category : 'podria-interesarte',
      reason: aiReason || (profile ? fallbackReason(profile, job) : ''),
      // Traducción solo para mostrar: el título real de la oferta (job.title)
      // nunca se toca y siempre viaja junto a ella.
      titleEs: typeof m.titleEs === 'string' ? m.titleEs.slice(0, 120) : '',
      rank: 0,
    });
  }
  for (const job of jobs) {
    if (seen.has(job.id)) continue;
    ranked.push({
      ...job,
      category: 'podria-interesarte',
      reason: profile ? fallbackReason(profile, job) : '',
      titleEs: '',
      rank: 0,
    });
  }

  // Guarda determinística de nivel (la IA puede equivocarse; esto no).
  let result = ranked;
  if (profileLevel === 'entry' || profileLevel === 'intermediate') {
    const cap = profileLevel === 'entry' ? 'podria-interesarte' : 'compatible';
    const adjusted = ranked.map((job) => {
      const { level } = jobLevel(job);
      if (level !== 'senior') return { job, senior: false };
      const capped = CATEGORIES.indexOf(job.category) < CATEGORIES.indexOf(cap) ? cap : job.category;
      return { job: { ...job, category: capped }, senior: true };
    });
    // Estable: los no-senior conservan su orden relativo; los senior van al final.
    result = [...adjusted.filter((x) => !x.senior), ...adjusted.filter((x) => x.senior)].map((x) => x.job);
  }

  return result.map((job, i) => ({ ...job, rank: i + 1 }));
}
