// Generación del PDF del CV en el navegador (jsPDF vendoreado, lazy-load).
// El layout es determinístico: sale del CV estructurado ya aprobado por la
// persona. A4, tipografía sobria, sin gráficos — apto ATS y para imprimir.

let jsPDFCtor = null;

async function loadJsPdf() {
  if (jsPDFCtor) return jsPDFCtor;
  // Carga diferida: el archivo (~130 KB gzip) solo se baja al descargar el CV.
  await new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = './vendor/jspdf.umd.min.js';
    s.onload = resolve;
    s.onerror = () => reject(new Error('No se pudo cargar el generador de PDF.'));
    document.head.appendChild(s);
  });
  jsPDFCtor = window.jspdf?.jsPDF;
  if (!jsPDFCtor) throw new Error('No se pudo iniciar el generador de PDF.');
  return jsPDFCtor;
}

/** Nombre de archivo seguro: CV-Nombre-Apellido.pdf (sin tildes ni símbolos). */
export function cvFilename(fullName) {
  const base = (fullName || '')
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9 ]/g, '')
    .trim().replace(/\s+/g, '-')
    .slice(0, 60);
  return `CV-${base || 'EconoChori'}.pdf`;
}

// Medidas en puntos (A4: 595.28 x 841.89).
const PAGE_W = 595.28;
const PAGE_H = 841.89;
const MARGIN = 52;
const CONTENT_W = PAGE_W - MARGIN * 2;

/** Genera y descarga el PDF a partir del CV estructurado aprobado. */
export async function downloadCvPdf(cv) {
  const JsPDF = await loadJsPdf();
  const doc = new JsPDF({ unit: 'pt', format: 'a4' });
  let y = MARGIN;

  const ensureSpace = (needed) => {
    if (y + needed > PAGE_H - MARGIN) {
      doc.addPage();
      y = MARGIN;
    }
  };

  const writeLines = (text, { size = 10, style = 'normal', color = 20, indent = 0, lineGap = 3.5 } = {}) => {
    doc.setFont('helvetica', style);
    doc.setFontSize(size);
    doc.setTextColor(color);
    const lines = doc.splitTextToSize(text, CONTENT_W - indent);
    for (const line of lines) {
      ensureSpace(size + lineGap);
      doc.text(line, MARGIN + indent, y);
      y += size + lineGap;
    }
  };

  const sectionTitle = (title) => {
    ensureSpace(34);
    y += 10;
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10.5);
    doc.setTextColor(20);
    doc.text(title.toUpperCase(), MARGIN, y);
    y += 5;
    doc.setDrawColor(120);
    doc.setLineWidth(0.7);
    doc.line(MARGIN, y, PAGE_W - MARGIN, y);
    y += 13;
  };

  // ---- Encabezado: nombre + contacto ----
  writeLines(cv.fullName || 'CV', { size: 21, style: 'bold', lineGap: 5 });
  const contactBits = [cv.contact?.location, cv.contact?.phone, cv.contact?.email].filter(Boolean);
  if (contactBits.length) {
    y += 2;
    writeLines(contactBits.join('  ·  '), { size: 9.5, color: 80 });
  }
  y += 4;
  doc.setDrawColor(20);
  doc.setLineWidth(1.4);
  doc.line(MARGIN, y, PAGE_W - MARGIN, y);
  y += 6;

  // ---- Secciones (solo si tienen contenido real) ----
  if (cv.professionalProfile) {
    sectionTitle('Perfil profesional');
    writeLines(cv.professionalProfile);
  }

  if (cv.experience?.length) {
    sectionTitle('Experiencia');
    cv.experience.forEach((exp, i) => {
      if (i > 0) y += 6;
      ensureSpace(30);
      const title = exp.title || 'Experiencia';
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(10.5);
      doc.setTextColor(20);
      const titleLines = doc.splitTextToSize(title, CONTENT_W - (exp.dates ? 110 : 0));
      doc.text(titleLines[0], MARGIN, y);
      if (exp.dates) {
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(9);
        doc.setTextColor(90);
        doc.text(exp.dates, PAGE_W - MARGIN, y, { align: 'right' });
      }
      y += 14;
      for (const extra of titleLines.slice(1)) {
        ensureSpace(14);
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(10.5);
        doc.setTextColor(20);
        doc.text(extra, MARGIN, y);
        y += 14;
      }
      if (exp.organization) {
        writeLines(exp.organization, { size: 9.5, style: 'italic', color: 80 });
      }
      for (const bullet of exp.bullets || []) {
        ensureSpace(14);
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(10);
        doc.setTextColor(20);
        doc.text('–', MARGIN + 2, y);
        const lines = doc.splitTextToSize(bullet, CONTENT_W - 16);
        for (let li = 0; li < lines.length; li++) {
          if (li > 0) ensureSpace(13.5);
          doc.text(lines[li], MARGIN + 14, y);
          y += 13.5;
        }
      }
    });
  }

  const simpleListSection = (title, items) => {
    if (!items?.length) return;
    sectionTitle(title);
    for (const item of items) {
      writeLines(`•  ${item}`, { indent: 2 });
    }
  };

  if (cv.skills?.length) {
    sectionTitle('Habilidades');
    writeLines(cv.skills.join('  ·  '));
  }
  simpleListSection('Educación', cv.education);
  simpleListSection('Cursos y certificaciones', cv.courses);
  if (cv.languages?.length) {
    sectionTitle('Idiomas');
    writeLines(cv.languages.join('  ·  '));
  }
  simpleListSection('Información adicional', cv.additionalInformation);

  doc.save(cvFilename(cv.fullName));
}
