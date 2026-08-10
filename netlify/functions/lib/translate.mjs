// Traducción determinística de títulos de ofertas (respaldo sin IA).
// La IA del ranking ya traduce; este módulo garantiza un título en español
// para los títulos ingleses comunes aun cuando la IA falla o no está.
// Si no podemos traducir con confianza, devolvemos '' y se muestra el
// título original: preferimos un título en inglés a una traducción rota.

// Frases completas primero (matcheo exacto del título normalizado).
const PHRASE_MAP = new Map([
  ['contracts lead', 'Responsable de Contratos'],
  ['cost engineer', 'Ingeniero/a de Costos'],
  ['strategic buyer', 'Comprador/a Estratégico/a'],
  ['warehouse coordinator', 'Coordinador/a de Depósito'],
  ['in store specialist', 'Especialista de Tienda'],
  ['customer service representative', 'Representante de Atención al Cliente'],
  ['customer service', 'Atención al Cliente'],
  ['customer support representative', 'Representante de Soporte al Cliente'],
  ['sales representative', 'Representante de Ventas'],
  ['sales associate', 'Asociado/a de Ventas'],
  ['store manager', 'Encargado/a de Tienda'],
  ['it recruiter', 'Reclutador/a IT'],
  ['recruitment coordinator', 'Coordinador/a de Selección de Personal'],
  ['aftersales specialist', 'Especialista de Posventa'],
  ['account manager', 'Ejecutivo/a de Cuentas'],
  ['project manager', 'Gerente de Proyectos'],
  ['data analyst', 'Analista de Datos'],
  ['software engineer', 'Ingeniero/a de Software'],
  ['delivery driver', 'Repartidor/a'],
  ['forklift operator', 'Operador/a de Autoelevador'],
  ['warehouse operator', 'Operario/a de Depósito'],
  ['cleaning staff', 'Personal de Limpieza'],
  ['kitchen assistant', 'Ayudante de Cocina'],
]);

// Palabras de rol (última palabra del título) y modificadores comunes.
const ROLE_MAP = new Map([
  ['manager', 'Gerente'],
  ['coordinator', 'Coordinador/a'],
  ['engineer', 'Ingeniero/a'],
  ['specialist', 'Especialista'],
  ['lead', 'Responsable'],
  ['buyer', 'Comprador/a'],
  ['representative', 'Representante'],
  ['assistant', 'Asistente'],
  ['analyst', 'Analista'],
  ['supervisor', 'Supervisor/a'],
  ['agent', 'Agente'],
  ['clerk', 'Empleado/a'],
  ['recruiter', 'Reclutador/a'],
  ['planner', 'Planificador/a'],
  ['driver', 'Chofer'],
  ['technician', 'Técnico/a'],
  ['operator', 'Operario/a'],
  ['cashier', 'Cajero/a'],
  ['cleaner', 'Personal de Limpieza'],
  ['cook', 'Cocinero/a'],
  ['developer', 'Desarrollador/a'],
  ['director', 'Director/a'],
]);

const MODIFIER_MAP = new Map([
  ['contracts', 'Contratos'], ['contract', 'Contratos'],
  ['cost', 'Costos'], ['costs', 'Costos'],
  ['warehouse', 'Depósito'],
  ['strategic', 'Estratégico/a'],
  ['sales', 'Ventas'],
  ['purchasing', 'Compras'], ['procurement', 'Compras'],
  ['customer', 'Clientes'], ['client', 'Clientes'],
  ['service', 'Servicio'], ['services', 'Servicios'],
  ['support', 'Soporte'],
  ['store', 'Tienda'],
  ['logistics', 'Logística'],
  ['marketing', 'Marketing'],
  ['finance', 'Finanzas'], ['financial', 'Finanzas'],
  ['accounting', 'Contabilidad'],
  ['quality', 'Calidad'],
  ['production', 'Producción'],
  ['maintenance', 'Mantenimiento'],
  ['operations', 'Operaciones'],
  ['project', 'Proyectos'], ['projects', 'Proyectos'],
  ['product', 'Producto'],
  ['data', 'Datos'],
  ['security', 'Seguridad'],
  ['kitchen', 'Cocina'],
  ['delivery', 'Reparto'],
  ['retail', 'Comercio Minorista'],
  ['aftersales', 'Posventa'],
  ['recruitment', 'Selección de Personal'],
  ['it', 'IT'], ['hr', 'RRHH'],
]);

// Sufijos de nivel que se conservan al final.
const LEVEL_WORDS = new Map([
  ['senior', 'Senior'], ['sr', 'Senior'], ['junior', 'Junior'], ['jr', 'Junior'], ['trainee', 'Trainee'],
]);

const normTitle = (s) => (s || '')
  .toLowerCase()
  .replace(/[^a-z0-9\s/&-]/gi, ' ')
  .replace(/\s+/g, ' ')
  .trim();

/** ¿El título parece estar en inglés? (heurística conservadora) */
export function looksEnglish(title) {
  const words = normTitle(title).split(' ');
  return words.some((w) => ROLE_MAP.has(w) || MODIFIER_MAP.has(w) || PHRASE_MAP.has(normTitle(title)));
}

/**
 * Traduce un título inglés común al español. Devuelve '' si el título ya
 * parece español o si no se puede traducir con confianza.
 */
export function titleToSpanish(title) {
  const cleaned = normTitle(title);
  if (!cleaned) return '';

  const exact = PHRASE_MAP.get(cleaned);
  if (exact) return exact;

  const words = cleaned.split(' ').filter((w) => w && w !== '-' && w !== '&' && w !== '/');
  if (!looksEnglish(title)) return '';

  // Separar sufijo de nivel (Senior/Junior) si está al principio o al final.
  let level = '';
  let rest = [...words];
  if (LEVEL_WORDS.has(rest[0])) { level = LEVEL_WORDS.get(rest[0]); rest = rest.slice(1); }
  else if (LEVEL_WORDS.has(rest[rest.length - 1])) { level = LEVEL_WORDS.get(rest[rest.length - 1]); rest = rest.slice(0, -1); }

  // Patrón "Modificador(es) + Rol" (ej. "Warehouse Coordinator").
  const roleWord = rest[rest.length - 1];
  const role = ROLE_MAP.get(roleWord);
  if (!role) return ''; // sin rol reconocible no traducimos: mejor el original

  const modifiers = rest.slice(0, -1);
  const translatedMods = modifiers.map((w) => MODIFIER_MAP.get(w));
  if (modifiers.length && translatedMods.some((m) => !m)) return ''; // palabra desconocida → no arriesgar

  const base = modifiers.length ? `${role} de ${translatedMods.join(' ')}` : role;
  return level ? `${base} ${level}` : base;
}

/**
 * Garantiza (best-effort) título en español en las ofertas ya rankeadas:
 * si titleEs está vacío o quedó igual a un título inglés, intenta la
 * traducción determinística. Nunca toca job.title ni la URL.
 */
export function ensureSpanishTitles(rankedJobs) {
  return rankedJobs.map((job) => {
    const current = (job.titleEs || '').trim();
    const unchanged = !current || current.toLowerCase() === (job.title || '').trim().toLowerCase();
    if (unchanged && looksEnglish(job.title)) {
      const translated = titleToSpanish(job.title);
      if (translated) return { ...job, titleEs: translated };
    }
    return job;
  });
}
