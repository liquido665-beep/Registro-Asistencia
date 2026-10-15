/**
 * SchemaService.gs - Preparación NO destructiva de la estructura del libro
 *
 * - Crea pestañas requeridas que falten (ej: "Resumenes").
 * - Agrega al final los encabezados requeridos que falten (ej: jornada, estado en Niveles).
 * - Carga/valida el catálogo de cursos (ensureCourses).
 * Nunca borra, renombra ni reordena datos o columnas existentes.
 */

/**
 * @param {string} [actorEmail]
 * @returns {{sheetsCreated:Array<string>, columnsAdded:Object, courses:Object}}
 */
function ensureSchema(actorEmail) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const result = { sheetsCreated: [], columnsAdded: {}, courses: null };

  Object.keys(CONFIG.REQUIRED_HEADERS).forEach(sheetName => {
    const required = CONFIG.REQUIRED_HEADERS[sheetName];
    let sheet = ss.getSheetByName(sheetName);

    if (!sheet) {
      sheet = ss.insertSheet(sheetName);
      sheet.getRange(1, 1, 1, required.length).setValues([required]).setFontWeight('bold');
      result.sheetsCreated.push(sheetName);
      return;
    }

    const existing = getSheetHeaders_(sheet);
    const missing = required.filter(h => existing.indexOf(h.toLowerCase()) === -1);
    if (missing.length > 0) {
      const startCol = sheet.getLastColumn() + 1;
      sheet.getRange(1, startCol, 1, missing.length).setValues([missing]).setFontWeight('bold');
      result.columnsAdded[sheetName] = missing;
    }
  });

  SpreadsheetApp.flush();
  result.courses = ensureCourses(actorEmail);

  writeAudit_(CONFIG.AUDIT_ACTIONS.ESTRUCTURA_ACTUALIZADA, 'Sistema', 'SCHEMA', result, actorEmail);
  return result;
}

/**
 * Acción de menú: "Preparar estructura (no destructivo)".
 */
function prepareStructure() {
  try {
    const r = ensureSchema();
    const lines = ['✅ Estructura preparada (sin borrar datos).'];
    lines.push(`\nPestañas creadas: ${r.sheetsCreated.length ? r.sheetsCreated.join(', ') : 'ninguna'}`);
    const cols = Object.keys(r.columnsAdded).map(s => `${s}: ${r.columnsAdded[s].join(', ')}`);
    lines.push(`Columnas agregadas: ${cols.length ? '\n  • ' + cols.join('\n  • ') : 'ninguna'}`);
    lines.push(`\nCursos creados: ${r.courses.created.length ? r.courses.created.join(', ') : 'ninguno'}`);
    lines.push(`Cursos completados: ${r.courses.updated.length ? r.courses.updated.join(', ') : 'ninguno'}`);
    if (r.courses.warnings.length) lines.push('\n⚠️ ' + r.courses.warnings.join('\n⚠️ '));
    showAlert_(lines.join('\n'));
  } catch (e) {
    showError_(e);
  }
}
