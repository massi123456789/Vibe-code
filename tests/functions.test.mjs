// Tests a nivel endpoint de las funciones Netlify (en modo mock).

import { test, before } from 'node:test';
import assert from 'node:assert/strict';

process.env.MOCK_AI = '1';
process.env.MOCK_JOBS = '1';

let generateCv, searchJobs, trackEvent, allowRequest;
before(async () => {
  generateCv = (await import('../netlify/functions/generate-cv.mjs')).default;
  searchJobs = (await import('../netlify/functions/search-jobs.mjs')).default;
  trackEvent = (await import('../netlify/functions/track-event.mjs')).default;
  ({ allowRequest } = await import('../netlify/functions/lib/rate-limit.mjs'));
});

const post = (body, ip = '203.0.113.10') =>
  new Request('http://localhost/', {
    method: 'POST',
    headers: { 'x-nf-client-connection-ip': ip },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });

const intake = {
  fullName: 'Lucía Fernández',
  location: 'Quilmes',
  desiredWork: 'gastronomía',
  schedule: 'Medio tiempo',
  educationLevel: 'Secundario completo',
  skills: 'cocinar, atención al cliente',
  experiences: [{ what: 'Cociné en un comedor comunitario', where: '', dates: '', tasks: '' }],
};

test('generate-cv devuelve CV estructurado en modo mock', async () => {
  const res = await generateCv(post(intake), {});
  assert.equal(res.status, 200);
  const { cv, mock } = await res.json();
  assert.equal(mock, true);
  assert.equal(cv.fullName, 'Lucía Fernández');
  assert.equal(cv.contact.location, 'Quilmes');
  assert.deepEqual(cv.languages, []); // no se inventan idiomas
});

test('generate-cv rechaza GET', async () => {
  const res = await generateCv(new Request('http://localhost/', { method: 'GET' }), {});
  assert.equal(res.status, 405);
});

test('generate-cv rechaza JSON inválido', async () => {
  const res = await generateCv(post('{esto no es json'), {});
  assert.equal(res.status, 400);
});

test('generate-cv rechaza payload gigante con 413', async () => {
  const res = await generateCv(post(JSON.stringify({ fullName: 'x'.repeat(50000) })), {});
  assert.equal(res.status, 413);
});

test('generate-cv rechaza intake incompleto con detalles', async () => {
  const res = await generateCv(post({ fullName: 'Solo Nombre' }), {});
  assert.equal(res.status, 400);
  const data = await res.json();
  assert.ok(Array.isArray(data.details));
});

test('search-jobs devuelve solo ofertas de la fuente (mock)', async () => {
  const res = await searchJobs(post({ desiredWork: 'gastronomía', location: 'Quilmes' }), {});
  assert.equal(res.status, 200);
  const { jobs, mock } = await res.json();
  assert.equal(mock, true);
  assert.ok(jobs.length > 0);
  for (const j of jobs) {
    assert.ok(j.id.startsWith('mock-'), 'toda oferta viene de la fuente mock');
    assert.match(j.url, /^https?:\/\//);
    assert.ok(['muy-compatible', 'compatible', 'podria-interesarte'].includes(j.category));
  }
});

test('search-jobs rechaza perfil vacío', async () => {
  const res = await searchJobs(post({}), {});
  assert.equal(res.status, 400);
});

test('track-event acepta eventos permitidos y rechaza desconocidos', async () => {
  const ok = await trackEvent(post({ event: 'cv_downloaded' }), {});
  assert.equal(ok.status, 200);
  const bad = await trackEvent(post({ event: 'robar_datos', nombre: 'Juan' }), {});
  assert.equal(bad.status, 400);
});

test('el rate limit corta después del máximo', () => {
  const limit = { max: 3, windowMs: 60000 };
  const key = 'test:1.2.3.4';
  assert.equal(allowRequest(key, limit), true);
  assert.equal(allowRequest(key, limit), true);
  assert.equal(allowRequest(key, limit), true);
  assert.equal(allowRequest(key, limit), false);
});

test('el rate limit se resetea al pasar la ventana', () => {
  const limit = { max: 1, windowMs: 1000 };
  const key = 'test:ventana';
  const t0 = Date.now();
  assert.equal(allowRequest(key, limit, t0), true);
  assert.equal(allowRequest(key, limit, t0 + 10), false);
  assert.equal(allowRequest(key, limit, t0 + 2000), true);
});
