// Dictado por voz como mejora progresiva (Web Speech API del navegador,
// sin servicios pagos). Si el navegador no lo soporta, no se muestra nada
// y todo sigue funcionando con teclado.

const Recognition = window.SpeechRecognition || window.webkitSpeechRecognition;

export const speechSupported = Boolean(Recognition);

/**
 * Agrega un botón "Hablar en vez de escribir" debajo de un textarea.
 * El texto dictado se agrega al final de lo ya escrito.
 */
export function attachMic(textarea, container) {
  if (!speechSupported || !textarea || !container) return;

  const row = document.createElement('div');
  row.className = 'mic-row';
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'mic-btn';
  btn.setAttribute('aria-pressed', 'false');
  btn.innerHTML = '🎙️ <span>Hablar en vez de escribir</span>';
  row.appendChild(btn);
  container.appendChild(row);

  let rec = null;

  const stop = () => {
    if (rec) { try { rec.stop(); } catch { /* ya detenido */ } rec = null; }
    btn.setAttribute('aria-pressed', 'false');
    btn.querySelector('span').textContent = 'Hablar en vez de escribir';
  };

  btn.addEventListener('click', () => {
    if (rec) { stop(); return; }
    rec = new Recognition();
    rec.lang = 'es-AR';
    rec.continuous = true;
    rec.interimResults = false;
    rec.onresult = (ev) => {
      for (let i = ev.resultIndex; i < ev.results.length; i++) {
        if (!ev.results[i].isFinal) continue;
        const text = ev.results[i][0].transcript.trim();
        if (!text) continue;
        textarea.value = textarea.value ? `${textarea.value.trimEnd()} ${text}` : text;
        textarea.dispatchEvent(new Event('input', { bubbles: true }));
      }
    };
    rec.onend = stop;
    rec.onerror = stop;
    try {
      rec.start();
      btn.setAttribute('aria-pressed', 'true');
      btn.querySelector('span').textContent = 'Escuchando… tocá para parar';
    } catch { stop(); }
  });
}
