// Nivel del perfil y nivel de las ofertas.
// EconoChori Oportunidades está pensado sobre todo para personas con poca
// experiencia formal: el nivel de las recomendaciones se adapta al perfil
// REAL de cada persona (inferido solo de lo que contó, sin suponer nada).

const norm = (s) => (s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');

// Señales de perfil profesional en el texto que escribió la persona.
const PROFESSIONAL_PROFILE_RE = /\b(ingenier|abogad|contador|contadur|licenciad|programad|desarrollad|software|sistemas|analista|marketing|dise[nñ]ad|arquitect|enfermer|medic|farmac|docente|profesor|psicolog|gerent|reclutad|recursos humanos|rrhh|finanzas|contabilidad|auditor|traductor|periodist|biotecnolog|laboratorio|desarrollo web|data|qa|devops)/;

// Señales de nivel intermedio (oficios calificados / administrativo).
const INTERMEDIATE_PROFILE_RE = /\b(administrativ|secretari|electricist|plomer|gasista|mecanic|soldador|carpinter|tecnic|excel avanzado|facturacion|estetic|peluquer|chofer profesional|matricul)/;

/**
 * Infiere el nivel laboral del perfil a partir del intake real.
 * 'entry' | 'intermediate' | 'professional'
 * En la duda, tiende a 'entry': mostrar puestos accesibles nunca lastima;
 * mostrar solo puestos senior a quien recién empieza, sí.
 */
export function inferProfileLevel(profile) {
  const text = norm(`${profile.desiredWork || ''} ${profile.skills || ''} ${profile.experienceSummary || ''}`);
  let score = 0;

  const edu = profile.educationLevel || '';
  if (edu === 'Universitario') score += 2;
  else if (edu === 'Terciario') score += 1;

  if (PROFESSIONAL_PROFILE_RE.test(text)) score += 2;
  if (INTERMEDIATE_PROFILE_RE.test(text)) score += 1;

  if (score >= 3) return 'professional';
  if (score >= 1) return 'intermediate';
  return 'entry';
}

// Señales de seniority en una oferta (título + descripción).
const SENIOR_TITLE_RE = /\b(senior|sr\.?|ssr|lead|manager|director|gerente|jefe|jefa|head|chief|principal|vp|supervisor de ingenier)/;
const SENIOR_PROFESSION_RE = /\b(engineer|ingenier[oa]|specialist|especialista|licenciad|abogad|contador|arquitect|scientist|developer|desarrollador|consultant|consultor|strategist|estrateg|buyer|analyst|analista)\b/;
const SENIOR_REQUIREMENTS_RE = /(t[ií]tulo universitario|estudios universitarios completos|graduad[oa] en|ingenier[ií]a|licenciatura|university degree|bachelor|posgrado|mba)/;
const YEARS_RE = /(\d+)\s*(?:\+|o m[aá]s)?\s*(?:a[nñ]os) de experiencia/;

// Señales de puesto accesible / de entrada.
const ENTRY_JOB_RE = /\b(ayudante|auxiliar|junior|jr\.?|trainee|aprendiz|pasant|sin experiencia|no se requiere experiencia|no requiere experiencia|operari[oa]|repositor|cajer[oa]|limpieza|mucam|mozo|moza|camarer[oa]|bacher[oa]|recepcionist|vendedor|venta|atencion al cliente|deposito|almacen|carga|descarga|delivery|repartidor|cadete|niner[ao]|cuidador|jardiner|mantenimiento|empaque|produccion|supermercado)/;

/**
 * Clasifica el nivel de una oferta: 'senior' | 'mid' | 'entry'.
 * Determinístico y basado solo en el texto real de la oferta.
 */
export function jobLevel(job) {
  const title = norm(job.title);
  const text = `${title} ${norm(job.snippet)}`;
  let score = 0;

  if (SENIOR_TITLE_RE.test(title)) score += 2;
  if (SENIOR_PROFESSION_RE.test(title)) score += 2;
  if (SENIOR_REQUIREMENTS_RE.test(text)) score += 1;
  const years = text.match(YEARS_RE);
  if (years && Number(years[1]) >= 3) score += 2;
  else if (years && Number(years[1]) >= 1) score += 1;

  const accessible = ENTRY_JOB_RE.test(title) || /sin experiencia|no se requiere experiencia|no requiere experiencia/.test(text);
  if (accessible) score -= 2;

  const level = score >= 2 ? 'senior' : accessible && score <= 0 ? 'entry' : 'mid';
  return { level, accessible };
}

// Mapa de habilidades/experiencia reales → categoría accesible para buscar.
// Se usa SOLO para ampliar una búsqueda sin resultados: siempre parte de algo
// que la persona realmente mencionó.
const ACCESSIBLE_TERM_MAP = [
  [/\b(?:cocin|gastronom|parrill|reposter|panader)/, 'ayudante de cocina'],
  [/\b(?:limpi|mucam|orden)/, 'limpieza'],
  [/\b(?:atencion|atender|cliente|mostrador|recepcion)/, 'atención al cliente'],
  [/\b(?:vend|venta|comercio|tienda)/, 'vendedor'],
  [/\b(?:reposi|mercader|gondola|supermercado|almacen)/, 'repositor'],
  [/\b(?:construc|alba[nñ]il|obra|pintur|pintar)/, 'ayudante de albañil'],
  [/\b(?:cuidar|cuidado|ni[nñ]os|abuel)|adultos mayores/, 'cuidado de personas'],
  [/\b(?:manej|conduc|chofer|moto|reparto|delivery)/, 'repartidor'],
  [/\b(?:deposito|logistic|carga|descarga|empaque)/, 'depósito'],
  [/\b(?:administra|oficina|excel|factur)/, 'administrativo'],
  [/\b(?:caja|cobr)/, 'cajero'],
  [/\b(?:seguridad|vigilan)/, 'seguridad'],
  [/\b(?:jardin|plantas)/, 'jardinería'],
];

/**
 * Sugiere UNA categoría de búsqueda accesible basada en lo que la persona
 * realmente contó (habilidades, experiencia o trabajo buscado).
 * Devuelve '' si nada de su perfil matchea (la búsqueda queda solo por zona).
 */
export function suggestAccessibleTerm(profile) {
  const text = norm(`${profile.desiredWork || ''} ${profile.skills || ''} ${profile.experienceSummary || ''}`);
  for (const [re, term] of ACCESSIBLE_TERM_MAP) {
    if (re.test(text)) return term;
  }
  return '';
}
