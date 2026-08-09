# CLAUDE.md — EconoChori

## Qué es este proyecto

- **EconoChori** es un proyecto de educación económica y cocina accesible en Buenos Aires
  (investigación de campo, recetas con precios reales, eventos comunitarios, prensa).
  El sitio principal es `index.html` (un solo archivo estático) y se deploya en Netlify:
  https://econochori.netlify.app/
- **EconoChori Oportunidades** (`/oportunidades/`) es una herramienta gratuita, mobile-first,
  para que personas con poca experiencia en tecnología o CVs puedan: contar su experiencia
  en español argentino → generar un CV profesional con IA → revisarlo y editarlo →
  descargarlo en PDF → buscar ofertas de trabajo reales (Jooble) rankeadas según su perfil.

## Reglas duras (no negociables)

1. **Nunca fabricar contenido de CV.** La IA solo reformula profesionalmente lo que la persona
   dijo. Prohibido inventar empleadores, títulos, fechas, estudios, certificaciones, idiomas,
   habilidades, logros cuantitativos o datos de contacto. Hay tests que verifican esto.
2. **Español argentino** en todo lo user-facing (vos/tenés/contanos; "trabajo", "CV",
   "postularme", "CABA", "Provincia de Buenos Aires"). Nada de español de España.
3. **Preservar el sitio existente.** No tocar contenido, estadísticas, links ni claims de
   investigación de `index.html` salvo pedido explícito. Oportunidades es una extensión.
4. **Secretos jamás en el frontend ni en Git.** `OPENAI_API_KEY` y `JOOBLE_API_KEY` viven solo
   en variables de entorno de Netlify y se usan solo en `netlify/functions/`. `.env` está en
   `.gitignore`; `.env.example` lleva solo nombres.
5. **Mínimo almacenamiento de PII.** No hay base de datos de usuarios. No persistir nombres,
   emails, teléfonos ni CVs. Las respuestas viven en `sessionStorage` del navegador y en
   procesamiento temporal. Analytics = solo eventos anónimos agregados (módulo `track`).
6. **Cuidar cuota de APIs externas.** Jooble arrancó con ~500 requests. En desarrollo usar
   los mocks (las funciones devuelven mocks si falta la key o con `MOCK_JOBS=1` / `MOCK_AI=1`).
   Producción: 1 búsqueda Jooble por usuario al llegar a matching, cacheada en sesión.
   Llamadas reales de desarrollo se anotan en `DEV-NOTES.md`.

## Arquitectura (mantenerla simple)

```
Frontend estático (index.html + oportunidades/)
        ↓ fetch
Netlify Functions (netlify/functions/*.mjs)
        ↓
OpenAI (CV + ranking) / Jooble (ofertas) / Netlify Blobs (contadores anónimos)
```

- Sin frameworks, sin build step, sin Supabase/Firebase/Docker/etc. No agregar
  infraestructura nueva sin justificarla primero al dueño del proyecto.
- Modelos de IA centralizados en `netlify/functions/lib/config.mjs` (overrideables por env).
- PDF: generado en el cliente con jsPDF vendoreado (`oportunidades/vendor/`), lazy-loaded.
- Netlify sigue siendo la plataforma de deploy; Jooble la fuente inicial de ofertas.

## Desarrollo

- `npm test` — corre los tests (`node --test tests/`). Correrlos antes de deployar.
- `npm run dev` — servidor local que sirve el sitio y emula las funciones en
  `/.netlify/functions/*` (usa mocks si no hay keys en el entorno).
- Accesibilidad móvil primero: probar a ~360px de ancho, tap targets grandes, buen contraste.
- Commits lógicos con prefijos `feat:` / `fix:` / `test:`.
