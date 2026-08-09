// Esquema estricto del CV estructurado + prompts para OpenAI.
// La IA devuelve SOLO este JSON; el layout lo controla el sitio.

export const CV_JSON_SCHEMA = {
  name: 'cv_estructurado',
  strict: true,
  schema: {
    type: 'object',
    additionalProperties: false,
    properties: {
      fullName: { type: 'string' },
      contact: {
        type: 'object',
        additionalProperties: false,
        properties: {
          email: { type: 'string' },
          phone: { type: 'string' },
          location: { type: 'string' },
        },
        required: ['email', 'phone', 'location'],
      },
      professionalProfile: { type: 'string' },
      experience: {
        type: 'array',
        items: {
          type: 'object',
          additionalProperties: false,
          properties: {
            title: { type: 'string' },
            organization: { type: 'string' },
            dates: { type: 'string' },
            bullets: { type: 'array', items: { type: 'string' } },
          },
          required: ['title', 'organization', 'dates', 'bullets'],
        },
      },
      education: { type: 'array', items: { type: 'string' } },
      skills: { type: 'array', items: { type: 'string' } },
      courses: { type: 'array', items: { type: 'string' } },
      languages: { type: 'array', items: { type: 'string' } },
      additionalInformation: { type: 'array', items: { type: 'string' } },
    },
    required: [
      'fullName', 'contact', 'professionalProfile', 'experience',
      'education', 'skills', 'courses', 'languages', 'additionalInformation',
    ],
  },
};

export const CV_SYSTEM_PROMPT = `Sos un redactor profesional de currículums en Argentina. Transformás la información real que da una persona en un CV claro y profesional, en español argentino neutro-formal (sin voseo en el texto del CV, sin español de España).

REGLAS ABSOLUTAS — INCUMPLIRLAS ARRUINA EL PRODUCTO:
1. NUNCA inventes información. Prohibido agregar: empleadores, fechas, títulos de puestos con jerarquía no mencionada, estudios, instituciones, certificaciones, idiomas, habilidades, logros cuantitativos (números, porcentajes), conocimientos de software, licencias, referencias o datos de contacto que la persona no haya dicho.
2. Si la persona no dio fechas, dejá "dates" vacío o usá exactamente la aproximación que dio (ej. "aprox. 2 años"). NO adivines años.
3. Si no hay empleador formal, describí el contexto real (ej. "Comercio familiar", "Trabajo por cuenta propia") sin inventar nombres. Si no se sabe, dejá "organization" vacío.
4. Los títulos de experiencia describen la función real sin inflarla: "Ayudante de cocina", no "Chef Ejecutivo"; "Apoyo en comercio minorista", no "Supervisor de Operaciones".
5. Omití secciones sin información legítima: devolvé arrays vacíos o strings vacíos, jamás rellenos genéricos.
6. Mantené la incertidumbre que expresó la persona.

ESTILO:
- Redacción profesional, concisa y natural. Nada de jerga corporativa ridícula ("sinergias", "proactividad disruptiva").
- Perfil profesional: 2-3 frases basadas SOLO en lo que la persona contó.
- Viñetas de experiencia: empezar con sustantivo o verbo de acción ("Atención al cliente", "Organización de mercadería"), máximo 4 por experiencia.
- Capitalización y ortografía correctas aunque la persona escriba informal.
- Largo total apropiado para 1 página (2 como máximo con mucha experiencia).
- Copiá los datos de contacto tal cual se dieron (corrigiendo solo mayúsculas/formato obvio).`;

/** Arma el mensaje de usuario con la información validada del intake. */
export function buildCvUserPrompt(intake) {
  const lines = [
    `Nombre y apellido: ${intake.fullName}`,
    `Zona: ${intake.location}`,
  ];
  if (intake.email) lines.push(`Email: ${intake.email}`);
  if (intake.phone) lines.push(`Teléfono: ${intake.phone}`);
  if (intake.desiredWork) lines.push(`Trabajo buscado: ${intake.desiredWork}`);
  if (intake.schedule && intake.schedule !== 'Cualquiera') lines.push(`Disponibilidad horaria: ${intake.schedule}`);

  if (intake.experiences.length) {
    lines.push('', 'Experiencias (texto literal de la persona):');
    intake.experiences.forEach((e, i) => {
      lines.push(`Experiencia ${i + 1}:`);
      if (e.what) lines.push(`- Qué hizo: ${e.what}`);
      if (e.where) lines.push(`- Dónde: ${e.where}`);
      if (e.dates) lines.push(`- Fechas (aprox.): ${e.dates}`);
      if (e.tasks) lines.push(`- Tareas principales: ${e.tasks}`);
    });
  } else {
    lines.push('', 'La persona no informó experiencias laborales previas. No inventes ninguna.');
  }

  if (intake.skills) lines.push('', `Habilidades (texto literal): ${intake.skills}`);
  if (intake.educationLevel && intake.educationLevel !== 'Prefiero no responder') {
    lines.push(`Nivel de estudios: ${intake.educationLevel}${intake.educationDetail ? ` — ${intake.educationDetail}` : ''}`);
  }
  if (intake.courses) lines.push(`Cursos/certificaciones (texto literal): ${intake.courses}`);
  if (intake.languages) lines.push(`Idiomas que dice hablar: ${intake.languages}`);
  if (intake.license) lines.push(`Licencia/registro: ${intake.license}`);
  if (intake.availability) lines.push(`Disponibilidad: ${intake.availability}`);
  if (intake.extras) lines.push(`Información adicional: ${intake.extras}`);

  lines.push('', 'Generá el CV estructurado usando únicamente esta información.');
  return lines.join('\n');
}

/** Estructura vacía de CV (fallback y base de normalización). */
export function emptyCv() {
  return {
    fullName: '',
    contact: { email: '', phone: '', location: '' },
    professionalProfile: '',
    experience: [],
    education: [],
    skills: [],
    courses: [],
    languages: [],
    additionalInformation: [],
  };
}

/**
 * Normaliza/asegura la forma del CV que devuelve la IA y fuerza los datos
 * de contacto a ser EXACTAMENTE los que dio la persona (nunca los de la IA).
 */
export function normalizeCv(raw, intake) {
  const base = emptyCv();
  const cv = { ...base, ...(raw && typeof raw === 'object' ? raw : {}) };
  const strArr = (a) => (Array.isArray(a) ? a.filter((x) => typeof x === 'string' && x.trim()).map((x) => x.trim()) : []);

  cv.fullName = intake.fullName;
  cv.contact = {
    email: intake.email || '',
    phone: intake.phone || '',
    location: intake.location || '',
  };
  cv.professionalProfile = typeof cv.professionalProfile === 'string' ? cv.professionalProfile.trim() : '';
  cv.experience = (Array.isArray(cv.experience) ? cv.experience : [])
    .filter((e) => e && typeof e === 'object')
    .slice(0, 10)
    .map((e) => ({
      title: typeof e.title === 'string' ? e.title.trim() : '',
      organization: typeof e.organization === 'string' ? e.organization.trim() : '',
      dates: typeof e.dates === 'string' ? e.dates.trim() : '',
      bullets: strArr(e.bullets).slice(0, 5),
    }))
    .filter((e) => e.title || e.bullets.length);
  cv.education = strArr(cv.education);
  cv.skills = strArr(cv.skills);
  cv.courses = strArr(cv.courses);
  cv.languages = strArr(cv.languages);
  cv.additionalInformation = strArr(cv.additionalInformation);
  return cv;
}
