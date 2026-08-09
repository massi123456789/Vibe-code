// Tests de seguridad del CV: la transformación NUNCA puede inventar
// información que la persona no dio.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mockCvFromIntake } from '../netlify/functions/lib/mock.mjs';
import { normalizeCv, buildCvUserPrompt } from '../netlify/functions/lib/cv-schema.mjs';

const baseIntake = {
  fullName: 'Carlos Gómez',
  email: '',
  phone: '',
  location: 'Florencio Varela',
  desiredWork: 'construcción',
  schedule: 'Cualquiera',
  skills: '',
  educationLevel: '',
  educationDetail: '',
  courses: '',
  languages: '',
  license: '',
  availability: '',
  extras: '',
  experiences: [],
};

test('experiencia informal no genera empleador ni título inventado', () => {
  const intake = {
    ...baseIntake,
    experiences: [{ what: 'Ayudé a mi tío en su almacén', where: '', dates: '', tasks: 'acomodaba cosas, cobraba' }],
  };
  const cv = mockCvFromIntake(intake);
  assert.equal(cv.experience.length, 1);
  // Sin "where", la organización queda vacía: no se inventa un empleador.
  assert.equal(cv.experience[0].organization, '');
  // El título es el texto de la persona, no un cargo jerárquico inventado.
  assert.ok(!/supervisor|gerente|jefe|director/i.test(cv.experience[0].title));
});

test('sin educación informada, el CV no tiene educación', () => {
  const cv = mockCvFromIntake({ ...baseIntake, educationLevel: '' });
  assert.deepEqual(cv.education, []);
});

test('"Prefiero no responder" no agrega educación', () => {
  const cv = mockCvFromIntake({ ...baseIntake, educationLevel: 'Prefiero no responder' });
  assert.deepEqual(cv.education, []);
});

test('sin fechas informadas, el CV no tiene fechas', () => {
  const intake = {
    ...baseIntake,
    experiences: [{ what: 'Trabajé en una obra', where: '', dates: '', tasks: '' }],
  };
  const cv = mockCvFromIntake(intake);
  assert.equal(cv.experience[0].dates, '');
});

test('sin certificaciones informadas, el CV no tiene cursos', () => {
  const cv = mockCvFromIntake({ ...baseIntake, courses: '' });
  assert.deepEqual(cv.courses, []);
});

test('sin idiomas informados, el CV no tiene idiomas', () => {
  const cv = mockCvFromIntake({ ...baseIntake, languages: '' });
  assert.deepEqual(cv.languages, []);
});

test('normalizeCv fuerza el contacto EXACTO que dio la persona (ignora el de la IA)', () => {
  const aiCv = {
    fullName: 'Otro Nombre Inventado',
    contact: { email: 'inventado@fake.com', phone: '11-0000-0000', location: 'Madrid' },
    professionalProfile: 'Perfil.',
    experience: [],
    education: [],
    skills: [],
    courses: [],
    languages: [],
    additionalInformation: [],
  };
  const cv = normalizeCv(aiCv, { ...baseIntake, email: 'carlos@mail.com', phone: '11-5555-5555' });
  assert.equal(cv.fullName, 'Carlos Gómez');
  assert.equal(cv.contact.email, 'carlos@mail.com');
  assert.equal(cv.contact.phone, '11-5555-5555');
  assert.equal(cv.contact.location, 'Florencio Varela');
});

test('normalizeCv tolera basura de la IA sin romper', () => {
  const cv = normalizeCv({ experience: [null, 'texto', { bullets: 'no-array' }], skills: 'no-array' }, baseIntake);
  assert.deepEqual(cv.experience, []);
  assert.deepEqual(cv.skills, []);
});

test('el prompt avisa explícitamente cuando no hay experiencias', () => {
  const prompt = buildCvUserPrompt(baseIntake);
  assert.match(prompt, /no informó experiencias laborales previas/i);
  assert.match(prompt, /No inventes/i);
});

test('el prompt solo contiene información que dio la persona', () => {
  const prompt = buildCvUserPrompt({ ...baseIntake, skills: 'pintar' });
  assert.ok(!prompt.includes('Idiomas'), 'no debe mencionar idiomas si no se dieron');
  assert.ok(!prompt.includes('Cursos'), 'no debe mencionar cursos si no se dieron');
  assert.ok(prompt.includes('pintar'));
});
