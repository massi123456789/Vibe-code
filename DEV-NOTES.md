# Notas de desarrollo — EconoChori Oportunidades

## Contador de llamadas reales a Jooble (cuota inicial: ~500)

Anotar acá cada llamada real hecha durante desarrollo/pruebas.
Las llamadas de producción no se anotan (las hace la gente al usar la herramienta).

| Fecha | Cantidad | Motivo |
|-------|----------|--------|
| 2026-08-09 | ~12 | Test de integración en producción. Hallazgo: la key está vinculada a EE.UU. (jooble.org/us.jooble.org devuelven ofertas de Miami; ar.jooble.org responde 403; búsquedas argentinas devuelven totalCount 0). Se necesita una key del sitio argentino de Jooble. |

**Key de EE.UU. (rotada, ya no se usa): ~12 requests de diagnóstico.**

| Fecha | Cantidad | Motivo (key ARGENTINA actual) |
|-------|----------|-------------------------------|
| 2026-08-09 | 5 | Verificación final en producción: "atención al cliente"+Buenos Aires (8.378 resultados), "repositor"+Buenos Aires (49), "limpieza"+CABA (1.200), chequeo de secretos y E2E completo del flujo. Todo OK. |

**Total usado de la key argentina: 5 de ~500.**

## Estado de la integración Jooble (2026-08-09) — ✅ FUNCIONANDO

- Key argentina configurada en Netlify; host por defecto `ar.jooble.org`
  (las keys de Jooble solo autentican en el host del país que las emitió;
  overrideable con `JOOBLE_API_HOST`).
- Parsing verificado contra la API real: `{totalCount, jobs:[...]}`. ✅
- Búsquedas argentinas devuelven ofertas reales (CABA y Provincia). ✅
- Nota: las páginas de ofertas de Jooble usan Cloudflare; desde IPs de
  datacenter devuelven un desafío ("Just a moment..."), pero los navegadores
  reales de las personas pasan ese chequeo normalmente.

## Modos mock

- Sin `OPENAI_API_KEY` (o con `MOCK_AI=1`): el CV se arma determinísticamente
  con las respuestas literales de la persona (sin IA, sin fabricar nada).
- Sin `JOOBLE_API_KEY` (o con `MOCK_JOBS=1`): la búsqueda devuelve las ofertas
  de ejemplo de `netlify/functions/lib/mock.mjs`.
