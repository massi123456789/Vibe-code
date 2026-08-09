// Mocks para desarrollo y fallback cuando faltan las API keys.
// El CV mock NUNCA inventa: solo reorganiza literalmente lo que dio la persona.
// Las ofertas mock son ficticias pero realistas para Buenos Aires (sin datos
// de personas reales) y sirven para desarrollar la UI sin gastar cuota Jooble.

import { emptyCv } from './cv-schema.mjs';

/**
 * Genera un CV determinístico a partir del intake, sin IA y sin fabricar nada.
 * Se usa cuando no hay OPENAI_API_KEY o con MOCK_AI=1.
 */
export function mockCvFromIntake(intake) {
  const cv = emptyCv();
  cv.fullName = intake.fullName;
  cv.contact = {
    email: intake.email || '',
    phone: intake.phone || '',
    location: intake.location || '',
  };

  const profileParts = [];
  if (intake.desiredWork) profileParts.push(`Persona en búsqueda de trabajo en ${intake.desiredWork.toLowerCase()}.`);
  if (intake.experiences.length) profileParts.push('Cuenta con experiencia descripta a continuación.');
  if (intake.schedule && intake.schedule !== 'Cualquiera') profileParts.push(`Disponibilidad: ${intake.schedule.toLowerCase()}.`);
  cv.professionalProfile = profileParts.join(' ');

  cv.experience = intake.experiences.map((e) => ({
    title: e.what || '',
    organization: e.where || '',
    dates: e.dates || '',
    bullets: e.tasks ? splitList(e.tasks) : [],
  }));

  if (intake.educationLevel && intake.educationLevel !== 'Prefiero no responder') {
    cv.education.push(intake.educationDetail
      ? `${intake.educationLevel} — ${intake.educationDetail}`
      : intake.educationLevel);
  }
  cv.skills = splitList(intake.skills);
  cv.courses = splitList(intake.courses);
  cv.languages = splitList(intake.languages);
  if (intake.license) cv.additionalInformation.push(`Licencia/registro: ${intake.license}`);
  if (intake.availability) cv.additionalInformation.push(`Disponibilidad: ${intake.availability}`);
  if (intake.extras) cv.additionalInformation.push(intake.extras);
  return cv;
}

function splitList(text) {
  if (!text) return [];
  return text.split(/[,;·\n]+/).map((s) => s.trim()).filter(Boolean).slice(0, 12);
}

/** Ofertas ficticias para desarrollo (formato ya normalizado). */
export const MOCK_JOBS = [
  {
    id: 'mock-1',
    title: 'Repositor/a para supermercado',
    company: 'Supermercado del Barrio',
    location: 'Palermo, CABA',
    snippet: 'Reposición de mercadería, control de stock y atención al público. Turnos rotativos.',
    salary: '',
    url: 'https://example.com/oferta/repositor',
    source: 'ejemplo.com',
    updated: '',
  },
  {
    id: 'mock-2',
    title: 'Atención al cliente en local gastronómico',
    company: 'Café Avenida',
    location: 'San Telmo, CABA',
    snippet: 'Atención de mesas y mostrador, manejo de caja. Experiencia en gastronomía valorada.',
    salary: '',
    url: 'https://example.com/oferta/atencion-cliente',
    source: 'ejemplo.com',
    updated: '',
  },
  {
    id: 'mock-3',
    title: 'Personal de limpieza para oficinas',
    company: 'Servicios Integrales SRL',
    location: 'Microcentro, CABA',
    snippet: 'Limpieza de oficinas en horario matutino. No se requiere experiencia previa.',
    salary: '',
    url: 'https://example.com/oferta/limpieza',
    source: 'ejemplo.com',
    updated: '',
  },
  {
    id: 'mock-4',
    title: 'Ayudante de cocina',
    company: 'Parrilla El Fogón',
    location: 'Avellaneda, Provincia de Buenos Aires',
    snippet: 'Preparación de ingredientes, apoyo en cocina y limpieza del sector.',
    salary: '',
    url: 'https://example.com/oferta/ayudante-cocina',
    source: 'ejemplo.com',
    updated: '',
  },
  {
    id: 'mock-5',
    title: 'Ayudante de obra / construcción',
    company: 'Constructora Sur',
    location: 'Quilmes, Provincia de Buenos Aires',
    snippet: 'Tareas generales de obra, carga de materiales y apoyo a oficiales.',
    salary: '',
    url: 'https://example.com/oferta/construccion',
    source: 'ejemplo.com',
    updated: '',
  },
  {
    id: 'mock-6',
    title: 'Administrativo/a con manejo de Excel',
    company: 'Distribuidora Norte',
    location: 'Vicente López, Provincia de Buenos Aires',
    snippet: 'Carga de datos, facturación y atención telefónica. Se requiere manejo básico de Excel.',
    salary: '',
    url: 'https://example.com/oferta/administrativo',
    source: 'ejemplo.com',
    updated: '',
  },
  {
    id: 'mock-7',
    title: 'Cuidado de adultos mayores',
    company: '',
    location: 'Caballito, CABA',
    snippet: 'Acompañamiento y asistencia en tareas diarias. Horario a convenir.',
    salary: '',
    url: 'https://example.com/oferta/cuidado',
    source: 'ejemplo.com',
    updated: '',
  },
  {
    id: 'mock-8',
    title: 'Vendedor/a para local de ropa',
    company: 'Tienda Urbana',
    location: 'Flores, CABA',
    snippet: 'Atención al cliente, manejo de caja y orden del local. Medio tiempo.',
    salary: '',
    url: 'https://example.com/oferta/ventas',
    source: 'ejemplo.com',
    updated: '',
  },
];
