// Ranking de ofertas contra el perfil del usuario.
// 1) keywordRank: determinístico, sin IA (fallback y complemento).
// 2) sanitizeAiRanking: valida la salida de la IA — solo puede referirse a
//    ofertas realmente provistas, jamás inventar ni modificar datos de ofertas.

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
            reason: { type: 'string' },
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
- "reason": una frase corta (máx. 25 palabras) que explique por qué puede encajar, basada SOLO en el perfil real y el texto real de la oferta. Frase natural tipo "Tu experiencia en X coincide con las tareas de este puesto".
- Nunca digas que la persona está garantizada a calificar o a ser contratada.
- category: "muy-compatible" solo con coincidencia clara de experiencia/habilidades; "compatible" con coincidencia parcial; "podria-interesarte" si es plausible como puesto de entrada cercano.
- rank: 1 = mejor. Incluí todas las ofertas provistas.
- titleEs: escribí el título del puesto EN ESPAÑOL, siempre. Nada de títulos en inglés en titleEs: "Warehouse Coordinator" → "Coordinador/a de Depósito", "In Store Specialist" → "Especialista de Tienda". Mantené siglas usuales (IT, RRHH, Excel). Traducción fiel: sin cambiar el nivel del puesto, sin agregar ubicación ni empresa.`;

/** Prompt de usuario compacto para el ranking. */
export function buildRankUserPrompt(profile, jobs) {
  const p = [
    `Perfil real:`,
    `- Busca: ${profile.desiredWork}`,
    profile.skills ? `- Habilidades: ${profile.skills}` : '',
    profile.experienceSummary ? `- Experiencia: ${profile.experienceSummary}` : '',
    `- Zona: ${profile.location}`,
    profile.schedule && profile.schedule !== 'Cualquiera' ? `- Horario: ${profile.schedule}` : '',
    '',
    'Ofertas:',
  ].filter(Boolean);
  for (const j of jobs) {
    p.push(`[${j.id}] ${j.title}${j.company ? ` — ${j.company}` : ''} (${j.location}). ${j.snippet}`);
  }
  p.push('', 'Recordá: titleEs va SIEMPRE en español. Traducí todo título que esté en inglés.');
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
 * Ranking determinístico por coincidencia de palabras del perfil con la oferta.
 * No inventa nada: solo ordena y categoriza las ofertas recibidas.
 */
export function keywordRank(profile, jobs) {
  const profileTokens = new Set([
    ...tokens(profile.desiredWork),
    ...tokens(profile.skills),
    ...tokens(profile.experienceSummary),
  ]);
  const desired = new Set(tokens(profile.desiredWork));

  const scored = jobs.map((job) => {
    const jobTokens = new Set([...tokens(job.title), ...tokens(job.snippet)]);
    let score = 0;
    let desiredHit = false;
    for (const t of jobTokens) {
      if (desired.has(t)) { score += 3; desiredHit = true; }
      else if (profileTokens.has(t)) score += 1;
    }
    const category = desiredHit && score >= 5 ? 'muy-compatible'
      : score >= 2 ? 'compatible'
      : 'podria-interesarte';
    const reason = desiredHit
      ? 'El puesto coincide con el tipo de trabajo que estás buscando.'
      : score >= 2
        ? 'Algunas tareas del puesto coinciden con tu experiencia o habilidades.'
        : 'Puede ser una opción cercana a lo que buscás.';
    return { job, score, category, reason };
  });

  scored.sort((a, b) => b.score - a.score);
  return scored.map((s, i) => ({
    ...s.job,
    category: s.category,
    reason: s.reason,
    titleEs: '', // sin IA no traducimos: se muestra el título original
    rank: i + 1,
  }));
}

/**
 * Aplica el ranking de la IA a las ofertas reales.
 * - Ignora jobIds que no existen (la IA no puede inventar ofertas).
 * - Los datos de la oferta (título, empresa, URL, sueldo) salen SIEMPRE de la
 *   oferta original, nunca de la IA. La IA solo aporta categoría/razón/orden.
 * - Ofertas que la IA omitió van al final como "podria-interesarte".
 */
export function sanitizeAiRanking(aiOutput, jobs) {
  const byId = new Map(jobs.map((j) => [j.id, j]));
  const seen = new Set();
  const ranked = [];

  const matches = Array.isArray(aiOutput?.matches) ? [...aiOutput.matches] : [];
  matches.sort((a, b) => (a?.rank ?? 999) - (b?.rank ?? 999));

  for (const m of matches) {
    const job = byId.get(String(m?.jobId));
    if (!job || seen.has(job.id)) continue;
    seen.add(job.id);
    ranked.push({
      ...job,
      category: CATEGORIES.includes(m.category) ? m.category : 'podria-interesarte',
      reason: typeof m.reason === 'string' ? m.reason.slice(0, 220) : '',
      // Traducción solo para mostrar: el título real de la oferta (job.title)
      // nunca se toca y siempre viaja junto a ella.
      titleEs: typeof m.titleEs === 'string' ? m.titleEs.slice(0, 120) : '',
      rank: ranked.length + 1,
    });
  }
  for (const job of jobs) {
    if (seen.has(job.id)) continue;
    ranked.push({
      ...job,
      category: 'podria-interesarte',
      reason: '',
      titleEs: '',
      rank: ranked.length + 1,
    });
  }
  return ranked;
}
