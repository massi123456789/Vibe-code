// Cliente mínimo de OpenAI (Chat Completions + Structured Outputs) vía fetch.
// Sin SDK: menos dependencias y bundle más chico para las funciones.
// La clave vive SOLO en la variable de entorno OPENAI_API_KEY.

const OPENAI_URL = 'https://api.openai.com/v1/chat/completions';

/**
 * Llama a OpenAI pidiendo salida JSON validada contra un json_schema.
 * Devuelve el objeto parseado. Lanza Error con .status en fallas.
 */
export async function callOpenAIJson({ model, system, user, schema, maxTokens }) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw Object.assign(new Error('OPENAI_API_KEY no configurada'), { status: 503 });

  const res = await fetch(OPENAI_URL, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: user },
      ],
      response_format: { type: 'json_schema', json_schema: schema },
      max_tokens: maxTokens,
      temperature: 0.3,
    }),
  });

  if (!res.ok) {
    // No loguear el body completo por las dudas; solo status.
    throw Object.assign(new Error(`OpenAI respondió ${res.status}`), { status: 502 });
  }

  const data = await res.json();
  const content = data?.choices?.[0]?.message?.content;
  if (!content) throw Object.assign(new Error('Respuesta vacía de OpenAI'), { status: 502 });
  try {
    return JSON.parse(content);
  } catch {
    throw Object.assign(new Error('OpenAI devolvió JSON inválido'), { status: 502 });
  }
}
