// Tests del matching: el ranking solo puede ordenar ofertas reales,
// nunca inventarlas ni modificarlas.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { keywordRank, sanitizeAiRanking, CATEGORIES } from '../netlify/functions/lib/rank.mjs';
import { buildSearchQuery, buildBroaderQuery, normalizeJoobleJob } from '../netlify/functions/lib/jooble.mjs';

const profile = {
  desiredWork: 'atención al cliente',
  skills: 'manejo de caja, ventas',
  location: 'CABA',
  schedule: 'Cualquiera',
  experienceSummary: 'apoyo en comercio minorista',
};

const jobs = [
  { id: 'a', title: 'Atención al cliente', company: 'X', location: 'CABA', snippet: 'atención al cliente y caja', salary: '', url: 'https://jobs.example/a', source: 's', updated: '' },
  { id: 'b', title: 'Programador Java', company: 'Y', location: 'CABA', snippet: 'desarrollo backend', salary: '', url: 'https://jobs.example/b', source: 's', updated: '' },
];

test('keywordRank solo devuelve las ofertas provistas', () => {
  const ranked = keywordRank(profile, jobs);
  assert.equal(ranked.length, jobs.length);
  const ids = ranked.map((j) => j.id).sort();
  assert.deepEqual(ids, ['a', 'b']);
});

test('keywordRank no modifica las URLs de las ofertas', () => {
  const ranked = keywordRank(profile, jobs);
  for (const j of ranked) {
    const original = jobs.find((o) => o.id === j.id);
    assert.equal(j.url, original.url);
    assert.equal(j.title, original.title);
    assert.equal(j.company, original.company);
  }
});

test('keywordRank pone la oferta más afín primero y usa categorías válidas', () => {
  const ranked = keywordRank(profile, jobs);
  assert.equal(ranked[0].id, 'a');
  for (const j of ranked) assert.ok(CATEGORIES.includes(j.category));
});

test('sanitizeAiRanking descarta jobIds inventados por la IA', () => {
  const ai = { matches: [
    { jobId: 'inventado-999', category: 'muy-compatible', reason: 'x', rank: 1 },
    { jobId: 'a', category: 'muy-compatible', reason: 'coincide', rank: 2 },
  ] };
  const ranked = sanitizeAiRanking(ai, jobs);
  assert.equal(ranked.length, 2); // a + b (b agregado al final), nunca el inventado
  assert.ok(!ranked.some((j) => j.id === 'inventado-999'));
});

test('sanitizeAiRanking conserva título/empresa/URL originales aunque la IA diga otra cosa', () => {
  const ai = { matches: [{ jobId: 'a', category: 'muy-compatible', reason: 'ok', rank: 1 }] };
  const ranked = sanitizeAiRanking(ai, jobs);
  const a = ranked.find((j) => j.id === 'a');
  assert.equal(a.url, 'https://jobs.example/a');
  assert.equal(a.title, 'Atención al cliente');
});

test('sanitizeAiRanking incluye ofertas omitidas por la IA y clampa categorías raras', () => {
  const ai = { matches: [{ jobId: 'a', category: '96.7% compatible', reason: 'x', rank: 1 }] };
  const ranked = sanitizeAiRanking(ai, jobs);
  assert.equal(ranked.length, 2);
  assert.equal(ranked[0].category, 'podria-interesarte'); // categoría inválida → clamp
  assert.ok(ranked.some((j) => j.id === 'b'));
});

test('buildSearchQuery deriva un término conciso, no el CV entero', () => {
  const q = buildSearchQuery({ desiredWork: 'atención al cliente, ventas y lo que sea', location: 'CABA' });
  assert.equal(q.keywords, 'atención al cliente');
  assert.equal(q.location, 'Buenos Aires'); // CABA normalizado para Jooble
});

test('buildSearchQuery respeta ubicaciones fuera de Buenos Aires', () => {
  const q = buildSearchQuery({ desiredWork: 'limpieza', location: 'Córdoba' });
  assert.equal(q.location, 'Córdoba');
});

test('normalizeJoobleJob saca HTML del snippet y rechaza links no-http', () => {
  const job = normalizeJoobleJob({
    id: 42,
    title: '<b>Repositor</b>',
    snippet: 'Tareas de <br>reposición&nbsp;',
    link: 'javascript:alert(1)',
    location: 'Buenos Aires',
  });
  assert.equal(job.title, 'Repositor');
  assert.ok(!job.snippet.includes('<'));
  assert.equal(job.url, ''); // link inseguro descartado
});

test('sanitizeAiRanking pasa titleEs como traducción sin tocar el título real', () => {
  const ai = { matches: [{ jobId: 'a', category: 'compatible', reason: 'ok', rank: 1, titleEs: 'Atención al cliente (ES)' }] };
  const ranked = sanitizeAiRanking(ai, jobs);
  const a = ranked.find((j) => j.id === 'a');
  assert.equal(a.titleEs, 'Atención al cliente (ES)');
  assert.equal(a.title, 'Atención al cliente'); // el original nunca cambia
  assert.equal(a.url, 'https://jobs.example/a');
});

test('titleEs faltante o no-string queda vacío', () => {
  const ai = { matches: [{ jobId: 'a', category: 'compatible', reason: 'ok', rank: 1, titleEs: 42 }] };
  const ranked = sanitizeAiRanking(ai, jobs);
  assert.equal(ranked.find((j) => j.id === 'a').titleEs, '');
  assert.equal(ranked.find((j) => j.id === 'b').titleEs, ''); // omitida por la IA
});

test('keywordRank no traduce títulos (titleEs vacío)', () => {
  for (const j of keywordRank(profile, jobs)) assert.equal(j.titleEs, '');
});

test('buildBroaderQuery amplía a solo-ubicación manteniendo la zona', () => {
  const q = buildBroaderQuery({ desiredWork: 'reclutador IT trainee remoto', location: 'CABA' });
  assert.equal(q.keywords, '');
  assert.equal(q.location, 'Buenos Aires');
});
