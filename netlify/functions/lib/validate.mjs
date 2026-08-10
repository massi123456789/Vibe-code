// Validación y saneamiento server-side de la información del formulario.
// Nunca confiamos en la validación del cliente.

// Límites de longitud por campo (caracteres). Cortamos en vez de rechazar
// cuando el exceso es razonable; rechazamos payloads absurdos.
export const FIELD_LIMITS = {
  fullName: 80,
  email: 120,
  phone: 40,
  location: 120,
  desiredWork: 200,
  schedule: 30,
  skills: 600,
  educationLevel: 60,
  educationDetail: 200,
  courses: 600,
  languages: 200,
  license: 100,
  availability: 200,
  extras: 400,
  // por experiencia
  expWhat: 600,
  expWhere: 150,
  expDates: 80,
  expTasks: 600,
};

export const MAX_EXPERIENCES = 8;

const CONTROL_CHARS = /[\u0000-\u001f\u007f]/g;

/** Limpia un string: recorta, saca caracteres de control y aplica tope. */
export function cleanStr(value, maxLen) {
  if (typeof value !== 'string') return '';
  return value.replace(CONTROL_CHARS, ' ').replace(/\s+/g, ' ').trim().slice(0, maxLen);
}

export const EDUCATION_LEVELS = new Set([
  'Primario incompleto', 'Primario completo',
  'Secundario incompleto', 'Secundario completo',
  'Terciario', 'Universitario', 'Prefiero no responder', '',
]);

const SCHEDULES = new Set(['Tiempo completo', 'Medio tiempo', 'Cualquiera', '']);

/**
 * Valida y limpia el payload del intake.
 * Devuelve { ok, errors, intake } — intake solo si ok.
 */
export function validateIntake(raw) {
  const errors = [];
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return { ok: false, errors: ['payload inválido'] };
  }

  const intake = {
    fullName: cleanStr(raw.fullName, FIELD_LIMITS.fullName),
    email: cleanStr(raw.email, FIELD_LIMITS.email),
    phone: cleanStr(raw.phone, FIELD_LIMITS.phone),
    location: cleanStr(raw.location, FIELD_LIMITS.location),
    desiredWork: cleanStr(raw.desiredWork, FIELD_LIMITS.desiredWork),
    schedule: cleanStr(raw.schedule, FIELD_LIMITS.schedule),
    skills: cleanStr(raw.skills, FIELD_LIMITS.skills),
    educationLevel: cleanStr(raw.educationLevel, FIELD_LIMITS.educationLevel),
    educationDetail: cleanStr(raw.educationDetail, FIELD_LIMITS.educationDetail),
    courses: cleanStr(raw.courses, FIELD_LIMITS.courses),
    languages: cleanStr(raw.languages, FIELD_LIMITS.languages),
    license: cleanStr(raw.license, FIELD_LIMITS.license),
    availability: cleanStr(raw.availability, FIELD_LIMITS.availability),
    extras: cleanStr(raw.extras, FIELD_LIMITS.extras),
    experiences: [],
  };

  if (!intake.fullName) errors.push('Falta el nombre y apellido.');
  if (!intake.location) errors.push('Falta la zona donde vivís.');
  if (!intake.desiredWork) errors.push('Falta qué tipo de trabajo buscás.');
  if (intake.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(intake.email)) {
    errors.push('El correo electrónico no parece válido.');
  }
  if (!EDUCATION_LEVELS.has(intake.educationLevel)) {
    errors.push('Nivel de estudios inválido.');
  }
  if (!SCHEDULES.has(intake.schedule)) {
    errors.push('Modalidad horaria inválida.');
  }

  const rawExps = Array.isArray(raw.experiences) ? raw.experiences.slice(0, MAX_EXPERIENCES) : [];
  for (const e of rawExps) {
    if (!e || typeof e !== 'object') continue;
    const exp = {
      what: cleanStr(e.what, FIELD_LIMITS.expWhat),
      where: cleanStr(e.where, FIELD_LIMITS.expWhere),
      dates: cleanStr(e.dates, FIELD_LIMITS.expDates),
      tasks: cleanStr(e.tasks, FIELD_LIMITS.expTasks),
    };
    if (exp.what || exp.tasks) intake.experiences.push(exp);
  }

  return errors.length ? { ok: false, errors } : { ok: true, errors: [], intake };
}

/**
 * Valida el perfil compacto que usa la búsqueda de trabajo.
 */
export function validateJobProfile(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return { ok: false, errors: ['payload inválido'] };
  }
  const profile = {
    desiredWork: cleanStr(raw.desiredWork, FIELD_LIMITS.desiredWork),
    skills: cleanStr(raw.skills, FIELD_LIMITS.skills),
    location: cleanStr(raw.location, FIELD_LIMITS.location),
    schedule: cleanStr(raw.schedule, FIELD_LIMITS.schedule),
    experienceSummary: cleanStr(raw.experienceSummary, 600),
    educationLevel: cleanStr(raw.educationLevel, FIELD_LIMITS.educationLevel),
  };
  // Nivel educativo desconocido no invalida la búsqueda: se ignora.
  if (!EDUCATION_LEVELS.has(profile.educationLevel)) profile.educationLevel = '';
  const errors = [];
  if (!profile.desiredWork) errors.push('Falta qué tipo de trabajo buscás.');
  if (!profile.location) errors.push('Falta la ubicación.');
  return errors.length ? { ok: false, errors } : { ok: true, errors: [], profile };
}

/** Nombre de archivo seguro: CV-Nombre-Apellido.pdf */
export function sanitizeFilename(fullName) {
  const base = (fullName || '')
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '') // saca tildes
    .replace(/[^a-zA-Z0-9 ]/g, '')
    .trim().replace(/\s+/g, '-')
    .slice(0, 60);
  return `CV-${base || 'EconoChori'}.pdf`;
}

/** Lee el body JSON de una Request con tope de tamaño. */
export async function readJsonBody(request, maxBytes) {
  const text = await request.text();
  if (text.length > maxBytes) {
    throw Object.assign(new Error('payload demasiado grande'), { status: 413 });
  }
  try {
    return JSON.parse(text);
  } catch {
    throw Object.assign(new Error('JSON inválido'), { status: 400 });
  }
}
