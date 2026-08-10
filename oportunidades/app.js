// EconoChori Oportunidades — flujo principal.
// Asistente paso a paso: intake → consentimiento → CV con IA → revisión →
// PDF → búsqueda de oportunidades → resultado opcional.
// Las respuestas viven SOLO en sessionStorage del navegador.

import { generateCv, searchJobs, trackEvent } from './api.js';
import { attachMic } from './speech.js';
import { downloadCvPdf } from './pdf.js';

const TOTAL_STEPS = 6;
const STORAGE_KEY = 'ecoop_v1';

// ---------- Estado ----------

const defaultState = () => ({
  screen: 'landing',
  consented: false,
  intake: {
    fullName: '', email: '', phone: '', location: '',
    desiredWork: '', schedule: 'Cualquiera',
    experiences: [],
    skills: '',
    educationLevel: '', educationDetail: '', courses: '',
    languages: '', license: '', availability: '', extras: '',
  },
  cv: null,          // CV estructurado (editable en revisión)
  cvApproved: false,
  jobsResult: null,  // cache de la búsqueda para esta sesión
  outcomeSent: false,
});

let state = loadState();

function loadState() {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (raw) return { ...defaultState(), ...JSON.parse(raw), screen: JSON.parse(raw).screen || 'landing' };
  } catch { /* estado corrupto: arrancar de cero */ }
  return defaultState();
}

function saveState() {
  try { sessionStorage.setItem(STORAGE_KEY, JSON.stringify(state)); } catch { /* sin storage */ }
}

// ---------- Utilidades ----------

const app = document.getElementById('app');
const landing = document.getElementById('landing');

/** Escapa texto para meterlo en HTML. Todo lo que venga del usuario o de APIs pasa por acá. */
function esc(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;').replaceAll("'", '&#39;');
}

function go(screen) {
  state.screen = screen;
  saveState();
  render();
  window.scrollTo({ top: 0, behavior: 'auto' });
}

function progressHtml(step) {
  const pct = Math.round((step / TOTAL_STEPS) * 100);
  return `
    <div class="progress">
      <span class="step-label">Paso ${step} de ${TOTAL_STEPS}</span>
      <div class="bar" role="progressbar" aria-valuenow="${step}" aria-valuemin="1" aria-valuemax="${TOTAL_STEPS}" aria-label="Paso ${step} de ${TOTAL_STEPS}">
        <div class="fill" style="width:${pct}%"></div>
      </div>
    </div>`;
}

function navButtons({ backScreen, nextLabel = 'Continuar' }) {
  return `
    <div class="wizard-nav">
      ${backScreen ? `<button type="button" class="btn btn-ghost" data-back="${backScreen}">Atrás</button>` : ''}
      <button type="submit" class="btn btn-primary">${nextLabel}</button>
    </div>`;
}

function bindBack(form, saveFields) {
  const backBtn = form.querySelector('[data-back]');
  if (backBtn) {
    backBtn.addEventListener('click', () => {
      if (saveFields) saveFields(); // ir atrás nunca pierde lo escrito
      go(backBtn.dataset.back);
    });
  }
}

function showFieldError(input, message) {
  input.setAttribute('aria-invalid', 'true');
  let err = input.parentElement.querySelector('.field-error');
  if (!err) {
    err = document.createElement('p');
    err.className = 'field-error';
    input.parentElement.appendChild(err);
  }
  err.textContent = message;
  input.focus();
}

function clearFieldErrors(form) {
  form.querySelectorAll('.field-error').forEach((e) => e.remove());
  form.querySelectorAll('[aria-invalid]').forEach((e) => e.removeAttribute('aria-invalid'));
}

// ---------- Pantallas ----------

const screens = {};

// -- Paso 1: datos personales --
const LOCATION_SUGGESTIONS = [
  'CABA', 'La Matanza', 'Quilmes', 'Lomas de Zamora', 'Avellaneda', 'Lanús',
  'Florencio Varela', 'Berazategui', 'Morón', 'Moreno', 'Merlo', 'San Martín',
  'Tres de Febrero', 'Tigre', 'San Isidro', 'Vicente López', 'La Plata',
  'Mar del Plata', 'Rosario', 'Córdoba', 'Mendoza', 'San Miguel de Tucumán',
];

screens.step1 = () => {
  const it = state.intake;
  app.innerHTML = `
    ${progressHtml(1)}
    <form class="card" novalidate>
      <h2>Contanos sobre vos</h2>
      <p class="hint">Estos datos van a aparecer en tu CV. No pedimos DNI ni dirección exacta.</p>
      <div class="field">
        <label for="fullName">Nombre y apellido</label>
        <input type="text" id="fullName" autocomplete="name" maxlength="80" value="${esc(it.fullName)}" required>
      </div>
      <div class="field">
        <label for="location">Zona donde vivís</label>
        <input type="text" id="location" list="locList" maxlength="120" value="${esc(it.location)}" required>
        <datalist id="locList">${LOCATION_SUGGESTIONS.map((l) => `<option value="${esc(l)}">`).join('')}</datalist>
        <p class="examples">Por ejemplo: CABA, tu partido o localidad en Provincia de Buenos Aires, o tu ciudad y provincia.</p>
      </div>
      <div class="field">
        <label for="email">Correo electrónico <span class="optional">(opcional, recomendado)</span></label>
        <input type="email" id="email" autocomplete="email" maxlength="120" value="${esc(it.email)}">
      </div>
      <div class="field">
        <label for="phone">Teléfono <span class="optional">(opcional, recomendado)</span></label>
        <input type="tel" id="phone" autocomplete="tel" maxlength="40" value="${esc(it.phone)}">
      </div>
      ${navButtons({ backScreen: 'landing' })}
    </form>`;

  const form = app.querySelector('form');
  const read = () => {
    it.fullName = form.fullName.value.trim();
    it.location = form.location.value.trim();
    it.email = form.email.value.trim();
    it.phone = form.phone.value.trim();
    saveState();
  };
  bindBack(form, read);
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    clearFieldErrors(form);
    read();
    if (!it.fullName) return showFieldError(form.fullName, 'Escribí tu nombre y apellido.');
    if (!it.location) return showFieldError(form.location, 'Contanos en qué zona vivís.');
    if (it.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(it.email)) {
      return showFieldError(form.email, 'Ese correo no parece válido. Revisalo o dejalo vacío.');
    }
    go('step2');
  });
};

// -- Paso 2: qué trabajo busca --
screens.step2 = () => {
  const it = state.intake;
  const schedules = ['Tiempo completo', 'Medio tiempo', 'Cualquiera'];
  app.innerHTML = `
    ${progressHtml(2)}
    <form class="card" novalidate>
      <h2>¿Qué tipo de trabajo estás buscando?</h2>
      <p class="hint">No hace falta un nombre exacto de puesto: contanos con tus palabras.</p>
      <div class="field">
        <label for="desiredWork">Trabajo que buscás</label>
        <textarea id="desiredWork" maxlength="200" rows="2" required>${esc(it.desiredWork)}</textarea>
        <p class="examples">Por ejemplo: “Atención al cliente, gastronomía, construcción, limpieza, administración…”</p>
      </div>
      <fieldset class="field">
        <legend><label>¿Buscás trabajo de tiempo completo, medio tiempo o cualquiera?</label></legend>
        <div class="radio-group">
          ${schedules.map((s) => `
            <label class="radio-pill">
              <input type="radio" name="schedule" value="${esc(s)}" ${it.schedule === s ? 'checked' : ''}>
              <span>${esc(s)}</span>
            </label>`).join('')}
        </div>
      </fieldset>
      ${navButtons({ backScreen: 'step1' })}
    </form>`;

  const form = app.querySelector('form');
  const read = () => {
    it.desiredWork = form.desiredWork.value.trim();
    it.schedule = form.querySelector('input[name=schedule]:checked')?.value || 'Cualquiera';
    saveState();
  };
  bindBack(form, read);
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    clearFieldErrors(form);
    read();
    if (!it.desiredWork) return showFieldError(form.desiredWork, 'Contanos qué tipo de trabajo buscás.');
    go('step3');
  });
};

// -- Paso 3: experiencias --
screens.step3 = () => {
  const it = state.intake;
  const list = it.experiences.map((e, i) => `
    <div class="exp-item">
      <div class="exp-head">
        <span class="exp-title">${esc(e.what || 'Experiencia')}</span>
        ${e.dates ? `<span class="exp-meta">${esc(e.dates)}</span>` : ''}
      </div>
      ${e.where ? `<p class="exp-meta">${esc(e.where)}</p>` : ''}
      <div class="exp-actions">
        <button type="button" class="link-btn" data-edit="${i}">Editar</button>
        <button type="button" class="link-btn danger" data-remove="${i}">Quitar</button>
      </div>
    </div>`).join('');

  app.innerHTML = `
    ${progressHtml(3)}
    <div class="card">
      <h2>Contanos sobre tus trabajos o experiencias anteriores</h2>
      <p class="hint">No importa si fueron trabajos formales, changas, trabajo por cuenta propia o ayuda en un negocio familiar. Todo puede aportar experiencia.</p>
      <div id="expList">${list || '<p class="examples">Todavía no agregaste ninguna experiencia. Si no tenés, podés continuar igual.</p>'}</div>
      <div class="wizard-nav">
        <button type="button" class="btn btn-ghost" id="addExp">+ Agregar experiencia</button>
      </div>
      <form novalidate>
        ${navButtons({ backScreen: 'step2', nextLabel: 'Continuar' })}
      </form>
    </div>`;

  const form = app.querySelector('form');
  bindBack(form, null);
  form.addEventListener('submit', (e) => { e.preventDefault(); go('step4'); });
  app.querySelector('#addExp').addEventListener('click', () => renderExpForm(null));
  app.querySelectorAll('[data-edit]').forEach((b) => b.addEventListener('click', () => renderExpForm(Number(b.dataset.edit))));
  app.querySelectorAll('[data-remove]').forEach((b) => b.addEventListener('click', () => {
    it.experiences.splice(Number(b.dataset.remove), 1);
    saveState();
    screens.step3();
  }));
};

// Formulario de una experiencia (alta o edición).
function renderExpForm(index) {
  const it = state.intake;
  const exp = index !== null ? it.experiences[index] : { what: '', where: '', dates: '', tasks: '' };
  app.innerHTML = `
    ${progressHtml(3)}
    <form class="card" novalidate>
      <h2>${index !== null ? 'Editar experiencia' : 'Agregar una experiencia'}</h2>
      <p class="hint">Completá solo lo que sepas. Nada es obligatorio salvo qué hacías.</p>
      <div class="field">
        <label for="expWhat">¿Qué hacías?</label>
        <textarea id="expWhat" rows="2" maxlength="600" required>${esc(exp.what)}</textarea>
        <p class="examples">Por ejemplo: “Ayudaba en el almacén de mi tío” o “Trabajé de ayudante de albañil”.</p>
      </div>
      <div class="field">
        <label for="expWhere">¿Dónde? <span class="optional">(opcional)</span></label>
        <input type="text" id="expWhere" maxlength="150" value="${esc(exp.where)}">
        <p class="examples">Nombre del lugar si lo hay, o algo como “negocio familiar” o “por mi cuenta”.</p>
      </div>
      <div class="field">
        <label for="expDates">¿Cuándo, más o menos? <span class="optional">(opcional)</span></label>
        <input type="text" id="expDates" maxlength="80" value="${esc(exp.dates)}">
        <p class="examples">Por ejemplo: “2021 a 2023”, “unos 2 años” o “no me acuerdo exactamente”.</p>
      </div>
      <div class="field" id="tasksField">
        <label for="expTasks">¿Cuáles eran tus tareas principales? <span class="optional">(opcional)</span></label>
        <textarea id="expTasks" rows="3" maxlength="600">${esc(exp.tasks)}</textarea>
        <p class="examples">Por ejemplo: “Acomodaba mercadería, cobraba y atendía a la gente”.</p>
      </div>
      <div class="wizard-nav">
        <button type="button" class="btn btn-ghost" id="cancelExp">Cancelar</button>
        <button type="submit" class="btn btn-primary">Guardar experiencia</button>
      </div>
    </form>`;

  const form = app.querySelector('form');
  attachMic(form.expWhat, form.expWhat.parentElement);
  attachMic(form.expTasks, form.querySelector('#tasksField'));
  app.querySelector('#cancelExp').addEventListener('click', () => screens.step3());
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    clearFieldErrors(form);
    const next = {
      what: form.expWhat.value.trim(),
      where: form.expWhere.value.trim(),
      dates: form.expDates.value.trim(),
      tasks: form.expTasks.value.trim(),
    };
    if (!next.what) return showFieldError(form.expWhat, 'Contanos qué hacías en este trabajo.');
    if (index !== null) it.experiences[index] = next;
    else if (it.experiences.length < 8) it.experiences.push(next);
    saveState();
    screens.step3();
  });
}

// -- Paso 4: habilidades --
screens.step4 = () => {
  const it = state.intake;
  app.innerHTML = `
    ${progressHtml(4)}
    <form class="card" novalidate>
      <h2>¿Qué cosas sabés hacer bien?</h2>
      <p class="hint">Escribilas separadas por comas, como te salga.</p>
      <div class="field" id="skillsField">
        <label for="skills">Tus habilidades</label>
        <textarea id="skills" rows="3" maxlength="600">${esc(it.skills)}</textarea>
        <p class="examples">Por ejemplo: “Atender clientes, cocinar, usar herramientas, cuidar chicos, limpiar, manejar caja, Excel, pintar, vender…”</p>
      </div>
      ${navButtons({ backScreen: 'step3' })}
    </form>`;

  const form = app.querySelector('form');
  attachMic(form.skills, form.querySelector('#skillsField'));
  const read = () => { it.skills = form.skills.value.trim(); saveState(); };
  bindBack(form, read);
  form.addEventListener('submit', (e) => { e.preventDefault(); read(); go('step5'); });
};

// -- Paso 5: estudios y cursos --
const EDUCATION_LEVELS = [
  'Primario incompleto', 'Primario completo', 'Secundario incompleto',
  'Secundario completo', 'Terciario', 'Universitario', 'Prefiero no responder',
];

screens.step5 = () => {
  const it = state.intake;
  app.innerHTML = `
    ${progressHtml(5)}
    <form class="card" novalidate>
      <h2>Tus estudios</h2>
      <p class="hint">Todos los niveles suman. Si preferís, podés no responder.</p>
      <div class="field">
        <label for="educationLevel">¿Cuál es el nivel más alto de estudios que completaste?</label>
        <select id="educationLevel">
          <option value="">Elegí una opción…</option>
          ${EDUCATION_LEVELS.map((l) => `<option value="${esc(l)}" ${it.educationLevel === l ? 'selected' : ''}>${esc(l)}</option>`).join('')}
        </select>
      </div>
      <div class="field" id="eduDetailField" ${['Terciario', 'Universitario'].includes(it.educationLevel) ? '' : 'hidden'}>
        <label for="educationDetail">¿Qué estudiaste y dónde? <span class="optional">(opcional)</span></label>
        <input type="text" id="educationDetail" maxlength="200" value="${esc(it.educationDetail)}">
      </div>
      <div class="field">
        <label for="courses">¿Hiciste algún curso o tenés alguna certificación? <span class="optional">(opcional)</span></label>
        <textarea id="courses" rows="2" maxlength="600">${esc(it.courses)}</textarea>
        <p class="examples">Por ejemplo: “Manipulación de alimentos, electricidad, computación, idiomas…”</p>
      </div>
      ${navButtons({ backScreen: 'step4' })}
    </form>`;

  const form = app.querySelector('form');
  form.educationLevel.addEventListener('change', () => {
    const show = ['Terciario', 'Universitario'].includes(form.educationLevel.value);
    form.querySelector('#eduDetailField').hidden = !show;
  });
  const read = () => {
    it.educationLevel = form.educationLevel.value;
    it.educationDetail = form.educationDetail.value.trim();
    it.courses = form.courses.value.trim();
    saveState();
  };
  bindBack(form, read);
  form.addEventListener('submit', (e) => { e.preventDefault(); read(); go('step6'); });
};

// -- Paso 6: extras --
screens.step6 = () => {
  const it = state.intake;
  app.innerHTML = `
    ${progressHtml(6)}
    <form class="card" novalidate>
      <h2>Últimos detalles</h2>
      <p class="hint">Todo esto es opcional. Solo agregá lo que sea verdad: no hace falta completar nada.</p>
      <div class="field">
        <label for="languages">¿Hablás otros idiomas? <span class="optional">(opcional)</span></label>
        <input type="text" id="languages" maxlength="200" value="${esc(it.languages)}">
        <p class="examples">Por ejemplo: “Inglés básico” o “Guaraní”.</p>
      </div>
      <div class="field">
        <label for="license">¿Tenés registro de conducir? <span class="optional">(opcional)</span></label>
        <input type="text" id="license" maxlength="100" value="${esc(it.license)}">
        <p class="examples">Por ejemplo: “Registro de auto” o “Registro de moto”.</p>
      </div>
      <div class="field">
        <label for="availability">Disponibilidad horaria <span class="optional">(opcional)</span></label>
        <input type="text" id="availability" maxlength="200" value="${esc(it.availability)}">
        <p class="examples">Por ejemplo: “De lunes a viernes por la mañana” o “Fines de semana”.</p>
      </div>
      <div class="field">
        <label for="extras">¿Algo más que quieras contar? <span class="optional">(opcional)</span></label>
        <textarea id="extras" rows="2" maxlength="400">${esc(it.extras)}</textarea>
        <p class="examples">Por ejemplo: herramientas o programas que realmente sepas usar.</p>
      </div>
      ${navButtons({ backScreen: 'step5', nextLabel: 'Revisar y crear mi CV' })}
    </form>`;

  const form = app.querySelector('form');
  const read = () => {
    it.languages = form.languages.value.trim();
    it.license = form.license.value.trim();
    it.availability = form.availability.value.trim();
    it.extras = form.extras.value.trim();
    saveState();
  };
  bindBack(form, read);
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    read();
    trackEvent('intake_completed');
    go('consent');
  });
};

// -- Consentimiento --
screens.consent = () => {
  app.innerHTML = `
    <form class="card" novalidate>
      <h2>Antes de continuar</h2>
      <div class="consent-box">
        <p>Vamos a usar la información que nos brindes para ayudarte a crear tu CV y encontrar oportunidades laborales. No agregaremos experiencias, estudios ni habilidades que no hayas mencionado.</p>
        <p style="margin-top:.6rem">Esta versión de EconoChori Oportunidades no requiere crear una cuenta. Evitá incluir información sensible que no sea necesaria para tu currículum.</p>
      </div>
      <label class="check-row">
        <input type="checkbox" id="consentCheck" ${state.consented ? 'checked' : ''}>
        <span>Entiendo y quiero continuar.</span>
      </label>
      <p class="examples" style="margin-top:.7rem">Podés leer más en <a href="#" id="consentPrivacy">Privacidad</a>.</p>
      <div class="wizard-nav">
        <button type="button" class="btn btn-ghost" data-back="step6">Atrás</button>
        <button type="submit" class="btn btn-primary" id="consentBtn" ${state.consented ? '' : 'disabled'}>Crear mi CV</button>
      </div>
    </form>`;

  const form = app.querySelector('form');
  const check = form.querySelector('#consentCheck');
  const btn = form.querySelector('#consentBtn');
  check.addEventListener('change', () => {
    state.consented = check.checked;
    btn.disabled = !check.checked;
    saveState();
  });
  form.querySelector('#consentPrivacy').addEventListener('click', (e) => {
    e.preventDefault();
    document.getElementById('privacyModal').showModal();
  });
  bindBack(form, null);
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    if (!state.consented) return;
    go('generating');
  });
};

// -- Generación --
screens.generating = () => {
  app.innerHTML = `
    <div class="card state-box">
      <div class="spinner" aria-hidden="true"></div>
      <h2>Estamos armando tu CV…</h2>
      <p>Usamos solo la información que nos diste. Esto puede tardar unos segundos.</p>
    </div>`;

  generateCv(state.intake)
    .then(({ cv }) => {
      state.cv = cv;
      state.cvApproved = false;
      trackEvent('cv_generated');
      go('review');
    })
    .catch((err) => {
      app.innerHTML = `
        <div class="card state-box">
          <h2>No pudimos generar tu CV en este momento</h2>
          <div class="error-box" role="alert">${esc(err.message)}</div>
          <p>Tus respuestas siguen acá. Probá nuevamente.</p>
          <div class="wizard-nav">
            <button type="button" class="btn btn-ghost" id="backToForm">Volver a mis respuestas</button>
            <button type="button" class="btn btn-primary" id="retryGen">Probar de nuevo</button>
          </div>
        </div>`;
      app.querySelector('#retryGen').addEventListener('click', () => screens.generating());
      app.querySelector('#backToForm').addEventListener('click', () => go('step6'));
    });
};

// -- Revisión editable --
screens.review = () => {
  const cv = state.cv;
  if (!cv) return go('step1');
  const linesArea = (id, label, items, placeholder) => `
    <div class="field">
      <label for="${id}">${label} <span class="optional">(una por línea)</span></label>
      <textarea id="${id}" rows="3" placeholder="${esc(placeholder || '')}">${esc((items || []).join('\n'))}</textarea>
    </div>`;

  app.innerHTML = `
    <div class="card">
      <h2>Revisá tu CV</h2>
      <p class="hint">Asegurate de que toda la información sea correcta antes de descargarlo. Podés editar cualquier parte.</p>
      <div class="notice">
        <span aria-hidden="true">ℹ️</span>
        <span>EconoChori no agrega información que no hayas proporcionado. Si algo no refleja correctamente tu experiencia, editalo antes de continuar.</span>
      </div>
      <form novalidate>
        <div class="field">
          <label for="rvName">Nombre</label>
          <input type="text" id="rvName" maxlength="80" value="${esc(cv.fullName)}" required>
        </div>
        <div class="field">
          <label for="rvProfile">Perfil profesional</label>
          <textarea id="rvProfile" rows="3">${esc(cv.professionalProfile)}</textarea>
        </div>

        <div class="review-section">
          <h3>Experiencia</h3>
          ${cv.experience.length ? cv.experience.map((e, i) => `
            <div class="exp-item">
              <div class="field">
                <label for="rvExpTitle${i}">Puesto o función</label>
                <input type="text" id="rvExpTitle${i}" data-exp="${i}" data-f="title" maxlength="120" value="${esc(e.title)}">
              </div>
              <div class="field">
                <label for="rvExpOrg${i}">Lugar u organización</label>
                <input type="text" id="rvExpOrg${i}" data-exp="${i}" data-f="organization" maxlength="150" value="${esc(e.organization)}">
              </div>
              <div class="field">
                <label for="rvExpDates${i}">Fechas</label>
                <input type="text" id="rvExpDates${i}" data-exp="${i}" data-f="dates" maxlength="80" value="${esc(e.dates)}">
              </div>
              <div class="field">
                <label for="rvExpBul${i}">Tareas (una por línea)</label>
                <textarea id="rvExpBul${i}" data-exp="${i}" data-f="bullets" rows="3">${esc((e.bullets || []).join('\n'))}</textarea>
              </div>
              <button type="button" class="link-btn danger" data-delexp="${i}">Quitar esta experiencia</button>
            </div>`).join('') : '<p class="examples">Sin experiencias cargadas.</p>'}
        </div>

        <div class="review-section">
          <h3>Educación y habilidades</h3>
          ${linesArea('rvEducation', 'Educación', cv.education)}
          ${linesArea('rvSkills', 'Habilidades', cv.skills)}
          ${linesArea('rvCourses', 'Cursos y certificaciones', cv.courses)}
          ${linesArea('rvLanguages', 'Idiomas', cv.languages)}
          ${linesArea('rvAdditional', 'Información adicional', cv.additionalInformation)}
        </div>

        <div class="review-section">
          <h3>Contacto</h3>
          <div class="field">
            <label for="rvEmail">Correo electrónico</label>
            <input type="email" id="rvEmail" maxlength="120" value="${esc(cv.contact.email)}">
          </div>
          <div class="field">
            <label for="rvPhone">Teléfono</label>
            <input type="tel" id="rvPhone" maxlength="40" value="${esc(cv.contact.phone)}">
          </div>
          <div class="field">
            <label for="rvLocation">Zona</label>
            <input type="text" id="rvLocation" maxlength="120" value="${esc(cv.contact.location)}">
          </div>
        </div>

        <div class="wizard-nav">
          <button type="button" class="btn btn-ghost" id="backAnswers">Volver y cambiar respuestas</button>
          <button type="submit" class="btn btn-primary">Todo está correcto</button>
        </div>
      </form>
    </div>`;

  const form = app.querySelector('form');
  const splitLines = (v) => v.split('\n').map((s) => s.trim()).filter(Boolean);
  const readAll = () => {
    cv.fullName = form.querySelector('#rvName').value.trim();
    cv.professionalProfile = form.querySelector('#rvProfile').value.trim();
    form.querySelectorAll('[data-exp]').forEach((input) => {
      const e = cv.experience[Number(input.dataset.exp)];
      if (!e) return;
      if (input.dataset.f === 'bullets') e.bullets = splitLines(input.value);
      else e[input.dataset.f] = input.value.trim();
    });
    cv.education = splitLines(form.querySelector('#rvEducation').value);
    cv.skills = splitLines(form.querySelector('#rvSkills').value);
    cv.courses = splitLines(form.querySelector('#rvCourses').value);
    cv.languages = splitLines(form.querySelector('#rvLanguages').value);
    cv.additionalInformation = splitLines(form.querySelector('#rvAdditional').value);
    cv.contact.email = form.querySelector('#rvEmail').value.trim();
    cv.contact.phone = form.querySelector('#rvPhone').value.trim();
    cv.contact.location = form.querySelector('#rvLocation').value.trim();
    saveState();
  };

  form.querySelectorAll('[data-delexp]').forEach((b) => b.addEventListener('click', () => {
    readAll();
    cv.experience.splice(Number(b.dataset.delexp), 1);
    saveState();
    screens.review();
  }));
  form.querySelector('#backAnswers').addEventListener('click', () => { readAll(); go('step1'); });
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    readAll();
    if (!cv.fullName) return showFieldError(form.querySelector('#rvName'), 'El CV necesita tu nombre.');
    state.cvApproved = true;
    saveState();
    go('ready');
  });
};

// -- CV listo: vista previa + PDF + puente a oportunidades --
function cvPreviewHtml(cv) {
  const contact = [cv.contact.location, cv.contact.phone, cv.contact.email].filter(Boolean).join(' · ');
  const section = (title, inner) => (inner ? `<h3>${esc(title)}</h3>${inner}` : '');
  const list = (items) => (items?.length ? `<ul>${items.map((i) => `<li>${esc(i)}</li>`).join('')}</ul>` : '');
  return `
    <div class="cv-preview" aria-label="Vista previa de tu CV">
      <h2>${esc(cv.fullName)}</h2>
      ${contact ? `<p class="cv-contact">${esc(contact)}</p>` : ''}
      ${cv.professionalProfile ? `${section('Perfil profesional', `<p>${esc(cv.professionalProfile)}</p>`)}` : ''}
      ${cv.experience.length ? section('Experiencia', cv.experience.map((e) => `
        <div class="cv-exp">
          <div class="cv-exp-head">
            <span class="cv-exp-title">${esc(e.title)}</span>
            ${e.dates ? `<span class="cv-exp-dates">${esc(e.dates)}</span>` : ''}
          </div>
          ${e.organization ? `<p class="cv-exp-org">${esc(e.organization)}</p>` : ''}
          ${list(e.bullets)}
        </div>`).join('')) : ''}
      ${cv.skills.length ? section('Habilidades', `<p>${esc(cv.skills.join(' · '))}</p>`) : ''}
      ${section('Educación', list(cv.education))}
      ${section('Cursos y certificaciones', list(cv.courses))}
      ${cv.languages.length ? section('Idiomas', `<p>${esc(cv.languages.join(' · '))}</p>`) : ''}
      ${section('Información adicional', list(cv.additionalInformation))}
    </div>`;
}

screens.ready = () => {
  const cv = state.cv;
  if (!cv) return go('step1');
  app.innerHTML = `
    <div class="card">
      <h2>¡Tu CV está listo!</h2>
      <p class="hint">Así se va a ver tu CV en PDF. Revisalo antes de descargarlo.</p>
      ${cvPreviewHtml(cv)}
      <div class="wizard-nav">
        <button type="button" class="btn btn-ghost" id="editCv">Editar mi CV</button>
        <button type="button" class="btn btn-primary" id="downloadPdf">Descargar CV en PDF</button>
      </div>
      <p class="field-error" id="pdfError" hidden role="alert"></p>
    </div>
    <div class="card" style="margin-top:1rem">
      <h2>Ahora busquemos oportunidades para vos</h2>
      <p class="hint">Con la información de tu CV buscamos ofertas de trabajo publicadas que puedan encajar con tu perfil.</p>
      <button type="button" class="btn btn-blue btn-block" id="searchJobsBtn">Buscar oportunidades</button>
    </div>`;

  app.querySelector('#editCv').addEventListener('click', () => go('review'));
  app.querySelector('#downloadPdf').addEventListener('click', async (e) => {
    const btn = e.currentTarget;
    const errEl = app.querySelector('#pdfError');
    errEl.hidden = true;
    btn.disabled = true;
    btn.textContent = 'Preparando PDF…';
    try {
      await downloadCvPdf(cv);
      trackEvent('cv_downloaded');
    } catch (err) {
      errEl.textContent = err.message || 'No se pudo generar el PDF. Probá de nuevo.';
      errEl.hidden = false;
    } finally {
      btn.disabled = false;
      btn.textContent = 'Descargar CV en PDF';
    }
  });
  app.querySelector('#searchJobsBtn').addEventListener('click', () => go('jobs'));
};

// -- Búsqueda y ranking de ofertas --
const CATEGORY_LABELS = {
  'muy-compatible': 'Muy compatible',
  'compatible': 'Compatible',
  'podria-interesarte': 'Podría interesarte',
};

function buildJobProfile() {
  const it = state.intake;
  const cv = state.cv;
  return {
    desiredWork: it.desiredWork,
    skills: (cv?.skills?.length ? cv.skills.join(', ') : it.skills).slice(0, 600),
    location: it.location,
    schedule: it.schedule,
    experienceSummary: (cv?.experience || [])
      .map((e) => e.title).filter(Boolean).join('; ').slice(0, 600),
    // El nivel educativo ayuda a adaptar el nivel de los puestos recomendados.
    educationLevel: it.educationLevel,
  };
}

screens.jobs = () => {
  // Cache de sesión: navegar atrás/adelante no repite la búsqueda.
  if (state.jobsResult) return renderJobsResult();

  app.innerHTML = `
    <div class="card state-box">
      <div class="spinner" aria-hidden="true"></div>
      <h2>Buscando oportunidades…</h2>
      <p>Estamos revisando ofertas publicadas que puedan encajar con tu perfil.</p>
    </div>`;

  searchJobs(buildJobProfile())
    .then((result) => {
      state.jobsResult = result;
      saveState();
      trackEvent('job_search_completed');
      renderJobsResult();
    })
    .catch((err) => {
      app.innerHTML = `
        <div class="card state-box">
          <h2>No pudimos buscar oportunidades en este momento</h2>
          <div class="error-box" role="alert">${esc(err.message)}</div>
          <p>Tu CV ya está listo y podés volver a intentar la búsqueda.</p>
          <div class="wizard-nav">
            <button type="button" class="btn btn-ghost" id="backCv">Volver a mi CV</button>
            <button type="button" class="btn btn-primary" id="retryJobs">Probar de nuevo</button>
          </div>
        </div>`;
      app.querySelector('#retryJobs').addEventListener('click', () => screens.jobs());
      app.querySelector('#backCv').addEventListener('click', () => go('ready'));
    });
};

// Título para mostrar: la traducción al español cuando existe y es confiable;
// si no, el título original (mejor el original que una mala traducción).
// El título real de Jooble se conserva siempre internamente (j.title).
function jobDisplayTitle(j) {
  const norm = (s) => (s || '').toLowerCase().replace(/\s+/g, ' ').trim();
  const translated = j.titleEs && norm(j.titleEs) !== norm(j.title);
  return { heading: translated ? j.titleEs : j.title };
}

function renderJobsResult() {
  const { jobs = [], mock, broadened, message } = state.jobsResult || {};

  if (!jobs.length) {
    app.innerHTML = `
      <div class="card state-box">
        <h2>No encontramos suficientes oportunidades</h2>
        <p>${esc(message || 'No encontramos suficientes oportunidades con esta búsqueda. Probemos con una búsqueda un poco más amplia.')}</p>
        <div class="wizard-nav">
          <button type="button" class="btn btn-ghost" id="backCv">Volver a mi CV</button>
          <button type="button" class="btn btn-primary" id="retryJobs">Buscar de nuevo</button>
        </div>
      </div>`;
    app.querySelector('#backCv').addEventListener('click', () => go('ready'));
    app.querySelector('#retryJobs').addEventListener('click', () => {
      state.jobsResult = null;
      saveState();
      screens.jobs();
    });
    return;
  }

  app.innerHTML = `
    <div class="card" style="margin-bottom:1rem">
      <h2>Oportunidades para vos</h2>
      <p class="hint">Ordenadas según tu perfil. Las oportunidades son publicadas por terceros: revisá siempre los requisitos antes de postularte.</p>
      ${mock ? '<div class="notice"><span aria-hidden="true">🧪</span><span>Estás viendo ofertas de ejemplo (modo de prueba). Las ofertas reales aparecen cuando la búsqueda está conectada.</span></div>' : ''}
      ${broadened ? '<div class="notice"><span aria-hidden="true">🔎</span><span>No encontramos resultados exactos para lo que escribiste, así que ampliamos la búsqueda a otras oportunidades en tu zona.</span></div>' : ''}
    </div>
    <div id="jobList">
      ${jobs.map((j) => {
        const t = jobDisplayTitle(j);
        return `
        <article class="job-card">
          <span class="job-badge ${esc(j.category)}">${esc(CATEGORY_LABELS[j.category] || 'Podría interesarte')}</span>
          <h3>${esc(t.heading)}</h3>
          ${j.company ? `<p class="job-org">${esc(j.company)}</p>` : ''}
          <p class="job-loc">📍 ${esc(j.location || 'Argentina')}</p>
          ${j.salary ? `<p class="job-loc">💰 ${esc(j.salary)}</p>` : ''}
          ${Number.isFinite(j.updatedDays) ? `<p class="job-loc">🗓️ ${j.updatedDays === 0 ? 'Publicada o actualizada hoy' : j.updatedDays === 1 ? 'Actualizada hace 1 día' : `Actualizada hace ${esc(j.updatedDays)} días`}</p>` : ''}
          ${j.reason ? `<p class="job-reason"><b>Por qué puede encajar:</b> ${esc(j.reason)}</p>` : ''}
          <a class="btn btn-blue btn-sm" href="${esc(j.url)}" target="_blank" rel="noopener nofollow" data-joblink>Ver oportunidad</a>
          <p class="job-source">Publicada por terceros${j.source ? ` · ${esc(j.source)}` : ''}. EconoChori no es el empleador.</p>
        </article>`;
      }).join('')}
    </div>
    <div class="card" style="margin-top:1rem">
      <h2>¿Querés contarnos cómo te fue?</h2>
      <p class="hint">Es anónimo y nos ayuda a mejorar la herramienta.</p>
      <div class="outcome-grid" id="outcomeBtns" ${state.outcomeSent ? 'hidden' : ''}>
        <button type="button" class="btn btn-ghost" data-outcome="outcome_application">Me postulé</button>
        <button type="button" class="btn btn-ghost" data-outcome="outcome_interview">Conseguí una entrevista</button>
        <button type="button" class="btn btn-ghost" data-outcome="outcome_hired">Conseguí trabajo</button>
        <button type="button" class="btn btn-ghost" data-outcome="outcome_not_yet">Todavía no</button>
      </div>
      <p id="outcomeThanks" ${state.outcomeSent ? '' : 'hidden'}>¡Gracias por contarnos! Te deseamos lo mejor en la búsqueda. 💪</p>
    </div>
    <div class="wizard-nav" style="margin-top:1rem">
      <button type="button" class="btn btn-ghost" id="backCv">Volver a mi CV</button>
      <button type="button" class="btn btn-ghost" id="refreshJobs">Buscar de nuevo</button>
    </div>`;

  app.querySelectorAll('[data-joblink]').forEach((a) =>
    a.addEventListener('click', () => trackEvent('job_listing_clicked')));
  app.querySelectorAll('[data-outcome]').forEach((b) =>
    b.addEventListener('click', () => {
      trackEvent(b.dataset.outcome);
      state.outcomeSent = true;
      saveState();
      app.querySelector('#outcomeBtns').hidden = true;
      app.querySelector('#outcomeThanks').hidden = false;
    }));
  app.querySelector('#backCv').addEventListener('click', () => go('ready'));
  // Refrescar es deliberado: borra el cache de la sesión y hace UNA búsqueda nueva.
  app.querySelector('#refreshJobs').addEventListener('click', () => {
    state.jobsResult = null;
    saveState();
    screens.jobs();
  });
}

// ---------- Render principal ----------

function render() {
  if (state.screen === 'landing') {
    landing.hidden = false;
    app.hidden = true;
    app.innerHTML = '';
    return;
  }
  landing.hidden = true;
  app.hidden = false;
  (screens[state.screen] || screens.step1)();
}

// ---------- Arranque ----------

document.getElementById('startBtn').addEventListener('click', () => {
  trackEvent('oportunidades_started');
  go('step1');
});

const privacyModal = document.getElementById('privacyModal');
document.getElementById('privacyLink').addEventListener('click', (e) => {
  e.preventDefault();
  privacyModal.showModal();
});
document.getElementById('privacyClose').addEventListener('click', () => privacyModal.close());

render();
