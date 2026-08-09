# Notas de desarrollo — EconoChori Oportunidades

## Contador de llamadas reales a Jooble (cuota inicial: ~500)

Anotar acá cada llamada real hecha durante desarrollo/pruebas.
Las llamadas de producción no se anotan (las hace la gente al usar la herramienta).

| Fecha | Cantidad | Motivo |
|-------|----------|--------|
| — | 0 | Todo el desarrollo se hizo con mocks (`MOCK_JOBS`). Aún no se hicieron llamadas reales. |

**Total usado en desarrollo: 0**

## Prueba de integración real pendiente (requiere JOOBLE_API_KEY)

Cuando la key esté configurada, hacer estas 4 búsquedas (≈4 requests) y
verificar que el parsing de la respuesta real coincida con `lib/jooble.mjs`:

1. Buenos Aires + "atención al cliente"
2. Buenos Aires + "repositor"
3. CABA (se normaliza a "Buenos Aires") + "limpieza"
4. Buenos Aires + "ayudante de cocina"

## Modos mock

- Sin `OPENAI_API_KEY` (o con `MOCK_AI=1`): el CV se arma determinísticamente
  con las respuestas literales de la persona (sin IA, sin fabricar nada).
- Sin `JOOBLE_API_KEY` (o con `MOCK_JOBS=1`): la búsqueda devuelve las ofertas
  de ejemplo de `netlify/functions/lib/mock.mjs`.
