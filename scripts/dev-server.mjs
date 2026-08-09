// Servidor local de desarrollo: sirve el sitio estático y emula las
// funciones Netlify en /.netlify/functions/*. Sin keys en el entorno,
// las funciones responden con mocks (ideal para desarrollar sin gastar cuota).
// Uso: npm run dev  →  http://localhost:8888

import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { join, normalize, extname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const PORT = process.env.PORT || 8888;

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
};

const server = createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);

  // Emulación de funciones
  const fnMatch = url.pathname.match(/^\/\.netlify\/functions\/([a-z-]+)$/);
  if (fnMatch) {
    try {
      const mod = await import(join(ROOT, 'netlify/functions', `${fnMatch[1]}.mjs`));
      const body = await new Promise((resolve) => {
        const chunks = [];
        req.on('data', (c) => chunks.push(c));
        req.on('end', () => resolve(Buffer.concat(chunks)));
      });
      const request = new Request(`http://localhost${req.url}`, {
        method: req.method,
        headers: req.headers,
        body: ['GET', 'HEAD'].includes(req.method) ? undefined : body,
      });
      const response = await mod.default(request, {});
      res.writeHead(response.status, Object.fromEntries(response.headers));
      res.end(Buffer.from(await response.arrayBuffer()));
    } catch (err) {
      console.error('function error:', err);
      res.writeHead(500, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ error: 'error interno' }));
    }
    return;
  }

  // Archivos estáticos
  let path = normalize(url.pathname).replace(/^\/+/, '');
  if (path === '' || path === '.') path = 'index.html';
  if (path.endsWith('/')) path += 'index.html';
  const full = join(ROOT, path);
  if (!full.startsWith(ROOT)) { res.writeHead(403); res.end(); return; }
  try {
    let data;
    try {
      data = await readFile(full);
    } catch {
      data = await readFile(join(full, 'index.html'));
    }
    res.writeHead(200, { 'content-type': MIME[extname(full)] || MIME['.html'] });
    res.end(data);
  } catch {
    res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
    res.end('No encontrado');
  }
});

server.listen(PORT, () => {
  console.log(`EconoChori dev server: http://localhost:${PORT}`);
  console.log(`Oportunidades: http://localhost:${PORT}/oportunidades/`);
  console.log(process.env.OPENAI_API_KEY ? 'OpenAI: key detectada' : 'OpenAI: SIN key → CV mock');
  console.log(process.env.JOOBLE_API_KEY ? 'Jooble: key detectada' : 'Jooble: SIN key → ofertas mock');
});
