# Notas de desarrollo — EconoChori Oportunidades

## Contador de llamadas reales a Jooble (cuota inicial: ~500)

Anotar acá cada llamada real hecha durante desarrollo/pruebas.
Las llamadas de producción no se anotan (las hace la gente al usar la herramienta).

| Fecha | Cantidad | Motivo |
|-------|----------|--------|
| 2026-08-09 | ~12 | Test de integración en producción. Hallazgo: la key está vinculada a EE.UU. (jooble.org/us.jooble.org devuelven ofertas de Miami; ar.jooble.org responde 403; búsquedas argentinas devuelven totalCount 0). Se necesita una key del sitio argentino de Jooble. |

**Total usado en desarrollo: ~12** (las respuestas 403 probablemente no consumen cuota)

## Estado de la integración Jooble (2026-08-09)

- Parsing verificado contra la API real: la respuesta es `{totalCount, jobs:[...]}`
  con los campos esperados por `lib/jooble.mjs`. ✅ (verificado con ofertas de Miami)
- **Pendiente**: reemplazar `JOOBLE_API_KEY` en Netlify por una key emitida para
  Argentina (solicitarla desde https://ar.jooble.org/api/about). Con la key actual
  (EE.UU.), toda búsqueda argentina devuelve 0 y la UI muestra el estado vacío.
- Cuando llegue la key AR: rehacer 2-3 búsquedas de control (Buenos Aires +
  "atención al cliente" / "repositor") y anotar acá.

## Modos mock

- Sin `OPENAI_API_KEY` (o con `MOCK_AI=1`): el CV se arma determinísticamente
  con las respuestas literales de la persona (sin IA, sin fabricar nada).
- Sin `JOOBLE_API_KEY` (o con `MOCK_JOBS=1`): la búsqueda devuelve las ofertas
  de ejemplo de `netlify/functions/lib/mock.mjs`.
