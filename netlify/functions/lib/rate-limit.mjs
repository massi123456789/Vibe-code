// Throttling best-effort en memoria, por instancia de función.
// No es un rate limit perfecto (cada instancia serverless tiene su memoria),
// pero frena el abuso automatizado obvio sin agregar infraestructura paga.
// Si algún día hace falta algo más fuerte, discutirlo antes (ver CLAUDE.md).

const buckets = new Map();

/**
 * Devuelve true si la request está dentro del límite.
 * key: identificador (ej. "generate-cv:1.2.3.4").
 */
export function allowRequest(key, { max, windowMs }, now = Date.now()) {
  let bucket = buckets.get(key);
  if (!bucket || now - bucket.start > windowMs) {
    bucket = { start: now, count: 0 };
    buckets.set(key, bucket);
  }
  bucket.count += 1;

  // Limpieza ocasional para no acumular memoria.
  if (buckets.size > 5000) {
    for (const [k, b] of buckets) {
      if (now - b.start > windowMs) buckets.delete(k);
    }
  }
  return bucket.count <= max;
}

/** IP del cliente según headers de Netlify (best-effort). */
export function clientIp(request, context) {
  return context?.ip
    || request.headers.get('x-nf-client-connection-ip')
    || (request.headers.get('x-forwarded-for') || '').split(',')[0].trim()
    || 'unknown';
}
