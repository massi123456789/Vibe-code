// Tests de las cuatro mejoras del matching:
// 1) títulos en español, 2) frescura/vencimiento de ofertas,
// 3) razón de compatibilidad en TODAS las ofertas, 4) ranking adaptado al nivel.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { titleToSpanish, ensureSpanishTitles, looksEnglish } from '../netlify/functions/lib/translate.mjs';
import { updatedDaysAgo, normalizeJoobleJob, filterFreshJobs, searchJooble, buildBroaderQuery } from '../netlify/functions/lib/jooble.mjs';
import { inferProfileLevel, jobLevel, suggestAccessibleTerm } from '../netlify/functions/lib/level.mjs';
import { keywordRank, sanitizeAiRanking, preselectJobs, scoreJob, fallbackReason, CATEGORIES } from '../netlify/functions/lib/rank.mjs';
import { validateJobProfile } from '../netlify/functions/lib/validate.mjs';

const DAY = 86400_000;
const NOW = Date.parse('2026-08-10T00:00:00Z');

const mkJob = (over = {}) => ({
  id: over.id || 'j1',
  title: 'Repositor/a',
  company: 'Super',
  location: 'CABA',
  snippet: 'Reposición de mercadería.',
  salary: '',
  url: 'https://jobs.example/x',
  source: 's',
  updated: '',
  updatedDays: null,
  ...over,
});

const entryProfile = {
  desiredWork: 'repositor',
  skills: 'atender clientes, ordenar mercadería',
  location: 'CABA',
  schedule: 'Cualquiera',
  experienceSummary: 'ayudé en un almacén',
  educationLevel: 'Secundario completo',
};

const professionalProfile = {
  desiredWork: 'ingeniero de costos',
  skills: 'Excel avanzado, análisis de costos, finanzas',
  location: 'CABA',
  schedule: 'Cualquiera',
  experienceSummary: 'analista de costos en constructora',
  educationLevel: 'Universitario',
};

// ---------- 1) Títulos en español ----------

test('titleToSpanish traduce los títulos ingleses reportados', () => {
  assert.equal(titleToSpanish('Contracts Lead'), 'Responsable de Contratos');
  assert.equal(titleToSpanish('Cost Engineer'), 'Ingeniero/a de Costos');
  assert.equal(titleToSpanish('Strategic Buyer'), 'Comprador/a Estratégico/a');
  assert.equal(titleToSpanish('Warehouse Coordinator'), 'Coordinador/a de Depósito');
  assert.equal(titleToSpanish('In Store Specialist'), 'Especialista de Tienda');
});

test('titleToSpanish no toca títulos ya en español', () => {
  assert.equal(titleToSpanish('Repositor/a para supermercado'), '');
  assert.equal(titleToSpanish('Atención al cliente'), '');
  assert.equal(looksEnglish('Supervisor de Finanzas y Contabilidad') && titleToSpanish('Supervisor de Finanzas y Contabilidad'), '');
});

test('titleToSpanish prefiere no traducir antes que traducir mal', () => {
  // "Ocean" no está en el diccionario: mejor mostrar el original que inventar.
  assert.equal(titleToSpanish('Ocean Import Specialist'), '');
});

test('ensureSpanishTitles completa titleEs faltante sin tocar título ni URL', () => {
  const ranked = ensureSpanishTitles([
    mkJob({ id: 'a', title: 'Cost Engineer', titleEs: '' }),
    mkJob({ id: 'b', title: 'Warehouse Coordinator', titleEs: 'Warehouse Coordinator' }), // la IA copió el inglés
    mkJob({ id: 'c', title: 'Repositor/a', titleEs: '' }),
    mkJob({ id: 'd', title: 'Customer Service Representative', titleEs: 'Representante de Atención al Cliente' }),
  ]);
  assert.equal(ranked[0].titleEs, 'Ingeniero/a de Costos');
  assert.equal(ranked[0].title, 'Cost Engineer'); // el original nunca cambia
  assert.equal(ranked[0].url, 'https://jobs.example/x');
  assert.equal(ranked[1].titleEs, 'Coordinador/a de Depósito');
  assert.equal(ranked[2].titleEs, ''); // español: se muestra el original
  assert.equal(ranked[3].titleEs, 'Representante de Atención al Cliente'); // la de la IA se respeta
});

// ---------- 2) Frescura / ofertas vencidas ----------

test('updatedDaysAgo parsea fechas de Jooble y tolera basura', () => {
  assert.equal(updatedDaysAgo('2026-08-05T00:00:00.0000000', NOW), 5);
  assert.equal(updatedDaysAgo('', NOW), null);
  assert.equal(updatedDaysAgo('no es fecha', NOW), null);
});

test('normalizeJoobleJob calcula updatedDays', () => {
  const j = normalizeJoobleJob({ title: 'X', link: 'https://a.b/c', updated: '2026-07-31T00:00:00Z' }, 0, NOW);
  assert.equal(j.updatedDays, 10);
});

test('filterFreshJobs descarta viejas y conserva recientes y sin fecha', () => {
  const jobs = [
    mkJob({ id: 'vieja', updatedDays: 90 }),
    mkJob({ id: 'fresca', updatedDays: 3 }),
    mkJob({ id: 'sin-fecha', updatedDays: null }),
  ];
  const fresh = filterFreshJobs(jobs, 45);
  assert.deepEqual(fresh.map((j) => j.id), ['fresca', 'sin-fecha']);
});

test('el puntaje desprioriza ofertas viejas frente a idénticas recientes', () => {
  const fresca = scoreJob(entryProfile, mkJob({ updatedDays: 2 }));
  const vieja = scoreJob(entryProfile, mkJob({ updatedDays: 30 }));
  assert.ok(fresca.score > vieja.score);
});

test('searchJooble pide a Jooble solo ofertas recientes (datecreatedfrom)', async () => {
  const prevKey = process.env.JOOBLE_API_KEY;
  const prevFetch = globalThis.fetch;
  process.env.JOOBLE_API_KEY = 'clave-de-test';
  let sentBody = null;
  globalThis.fetch = async (url, opts) => {
    sentBody = JSON.parse(opts.body);
    return new Response(JSON.stringify({ totalCount: 1, jobs: [{ id: 1, title: 'X', link: 'https://a.b/c' }] }), { status: 200 });
  };
  try {
    const { jobs } = await searchJooble(entryProfile);
    assert.equal(jobs.length, 1);
    assert.match(sentBody.datecreatedfrom, /^\d{4}-\d{2}-\d{2}$/);
    assert.equal(sentBody.keywords, 'repositor');
  } finally {
    globalThis.fetch = prevFetch;
    if (prevKey === undefined) delete process.env.JOOBLE_API_KEY; else process.env.JOOBLE_API_KEY = prevKey;
  }
});

// ---------- 3) Razón en TODAS las ofertas ----------

test('keywordRank da razón no vacía a cada oferta', () => {
  const jobs = [mkJob({ id: 'a' }), mkJob({ id: 'b', title: 'Cost Engineer', snippet: 'costos' }), mkJob({ id: 'c', title: 'Otra cosa', snippet: 'nada que ver' })];
  for (const j of keywordRank(entryProfile, jobs)) {
    assert.ok(j.reason && j.reason.length > 10, `sin razón: ${j.title}`);
  }
});

test('sanitizeAiRanking rellena las razones que la IA omitió', () => {
  const jobs = [mkJob({ id: 'a' }), mkJob({ id: 'b', title: 'Vendedor/a' })];
  const ai = { matches: [{ jobId: 'a', category: 'compatible', reason: '', rank: 1, titleEs: '' }] }; // 'b' omitida, 'a' sin razón
  for (const j of sanitizeAiRanking(ai, jobs, entryProfile)) {
    assert.ok(j.reason && j.reason.length > 10, `sin razón: ${j.title}`);
  }
});

test('fallbackReason solo usa frases genéricas basadas en el perfil (sin inventos)', () => {
  const allowed = [
    'El puesto coincide con el tipo de trabajo que estás buscando.',
    'Algunas tareas del puesto coinciden con lo que contaste de tu experiencia o habilidades.',
    'Es un puesto accesible en tu zona que no exige experiencia previa específica.',
    'Es una oportunidad en tu zona que podría interesarte, aunque pide un perfil distinto al tuyo.',
  ];
  for (const job of [mkJob(), mkJob({ title: 'Cost Engineer', snippet: 'x' }), mkJob({ title: 'Limpieza', snippet: 'sin experiencia' })]) {
    assert.ok(allowed.includes(fallbackReason(entryProfile, job)));
  }
});

// ---------- 4) Nivel adaptado al perfil ----------

test('inferProfileLevel distingue entry / intermediate / professional', () => {
  assert.equal(inferProfileLevel(entryProfile), 'entry');
  assert.equal(inferProfileLevel(professionalProfile), 'professional');
  assert.equal(inferProfileLevel({
    desiredWork: 'administrativo', skills: 'facturación, Excel', location: 'CABA',
    educationLevel: 'Terciario', experienceSummary: '',
  }), 'intermediate');
});

test('jobLevel detecta seniority y accesibilidad', () => {
  assert.equal(jobLevel(mkJob({ title: 'Cost Engineer' })).level, 'senior');
  assert.equal(jobLevel(mkJob({ title: 'Contracts Lead' })).level, 'senior');
  assert.equal(jobLevel(mkJob({ title: 'Strategic Buyer' })).level, 'senior');
  assert.equal(jobLevel(mkJob({ title: 'Gerente de Planta', snippet: '5 años de experiencia y título universitario' })).level, 'senior');
  const rep = jobLevel(mkJob({ title: 'Repositor/a' }));
  assert.equal(rep.level, 'entry');
  assert.equal(rep.accessible, true);
  assert.equal(jobLevel(mkJob({ title: 'Ayudante de cocina' })).accessible, true);
});

test('perfil de entrada: los puestos accesibles van antes que los senior', () => {
  const jobs = [
    mkJob({ id: 'senior', title: 'Strategic Buyer', snippet: 'ordenar mercadería y atender clientes' }),
    mkJob({ id: 'entry', title: 'Repositor/a', snippet: 'reposición de mercadería' }),
  ];
  const ranked = keywordRank(entryProfile, jobs);
  assert.equal(ranked[0].id, 'entry');
  assert.equal(ranked.find((j) => j.id === 'senior').category, 'podria-interesarte'); // nunca "muy compatible"
});

test('perfil profesional: los puestos de su nivel se recomiendan con normalidad', () => {
  const jobs = [
    mkJob({ id: 'senior', title: 'Cost Engineer', snippet: 'análisis de costos en obra, Excel' }),
    mkJob({ id: 'entry', title: 'Repositor/a', snippet: 'reposición' }),
  ];
  const ranked = keywordRank(professionalProfile, jobs);
  assert.equal(ranked[0].id, 'senior');
  assert.notEqual(ranked[0].category, 'podria-interesarte');
});

test('guarda determinística: la IA no puede poner un puesto senior primero para un perfil de entrada', () => {
  const jobs = [
    mkJob({ id: 'senior', title: 'Contracts Lead' }),
    mkJob({ id: 'entry', title: 'Repositor/a' }),
  ];
  const ai = { matches: [
    { jobId: 'senior', category: 'muy-compatible', reason: 'x', rank: 1, titleEs: '' },
    { jobId: 'entry', category: 'compatible', reason: 'y', rank: 2, titleEs: '' },
  ] };
  const ranked = sanitizeAiRanking(ai, jobs, entryProfile);
  assert.equal(ranked[0].id, 'entry'); // el senior fue al final
  const senior = ranked.find((j) => j.id === 'senior');
  assert.equal(senior.category, 'podria-interesarte'); // degradado
  assert.equal(senior.url, 'https://jobs.example/x'); // datos intactos
});

test('la guarda no degrada para perfiles profesionales', () => {
  const jobs = [mkJob({ id: 'senior', title: 'Cost Engineer' })];
  const ai = { matches: [{ jobId: 'senior', category: 'muy-compatible', reason: 'x', rank: 1, titleEs: '' }] };
  const ranked = sanitizeAiRanking(ai, jobs, professionalProfile);
  assert.equal(ranked[0].category, 'muy-compatible');
});

test('preselectJobs manda a la IA lo más apto, no lo primero que llegó', () => {
  const jobs = [
    mkJob({ id: 'senior1', title: 'Cost Engineer' }),
    mkJob({ id: 'senior2', title: 'Strategic Buyer' }),
    mkJob({ id: 'apto', title: 'Repositor/a', snippet: 'reposición de mercadería' }),
  ];
  const pre = preselectJobs(entryProfile, jobs, 2);
  assert.equal(pre[0].id, 'apto');
  assert.equal(pre.length, 2);
});

test('la ampliación de búsqueda deriva una categoría accesible del perfil real', () => {
  assert.equal(suggestAccessibleTerm({ desiredWork: '', skills: 'cocinar y limpiar', experienceSummary: '' }), 'ayudante de cocina');
  assert.equal(suggestAccessibleTerm({ desiredWork: 'cuidar abuelos', skills: '', experienceSummary: '' }), 'cuidado de personas');
  assert.equal(suggestAccessibleTerm({ desiredWork: 'astronauta', skills: '', experienceSummary: '' }), '');
  const q = buildBroaderQuery({ desiredWork: 'algo rarísimo', skills: 'atender clientes', location: 'CABA' });
  assert.equal(q.keywords, 'atención al cliente');
  assert.equal(q.location, 'Buenos Aires');
});

test('validateJobProfile acepta educationLevel válido y descarta inválido', () => {
  const ok = validateJobProfile({ desiredWork: 'ventas', location: 'CABA', educationLevel: 'Universitario' });
  assert.equal(ok.profile.educationLevel, 'Universitario');
  const bad = validateJobProfile({ desiredWork: 'ventas', location: 'CABA', educationLevel: 'Doctorado en Marte' });
  assert.equal(bad.ok, true);
  assert.equal(bad.profile.educationLevel, ''); // se ignora, no invalida
});

test('las categorías siguen siendo solo las tres humanas', () => {
  assert.deepEqual(CATEGORIES, ['muy-compatible', 'compatible', 'podria-interesarte']);
});
