/**
 * ValidationService.gs - Servicio para validación estructural del libro de asistencia escolar
 * 
 * REQUISITOS DE SEGURIDAD:
 * - Operaciones 100% no destructivas (solo lectura).
 * - No modifica datos, pestañas, celdas ni permisos.
 * - No envía correos ni realiza peticiones externas.
 */

/**
 * Función principal que valida la existencia de todas las pestañas requeridas
 * y la presencia de sus encabezados mínimos obligatorios.
 */
function validateWorkbook() {
  const missingSheets = [];
  const missingColumnsMap = {};

  const requiredSheets = Object.values(CONFIG.SHEETS);

  requiredSheets.forEach(sheetName => {
    const sheet = getSheetByName_(sheetName);

    if (!sheet) {
      missingSheets.push(sheetName);
    } else {
      const actualHeaders = getSheetHeaders_(sheet);
      const expectedHeaders = CONFIG.REQUIRED_HEADERS[sheetName] || [];

      const missingCols = expectedHeaders.filter(
        expected => !actualHeaders.includes(expected.toLowerCase())
      );

      if (missingCols.length > 0) {
        missingColumnsMap[sheetName] = missingCols;
      }
    }
  });

  const hasMissingSheets = missingSheets.length > 0;
  const hasMissingColumns = Object.keys(missingColumnsMap).length > 0;

  if (!hasMissingSheets && !hasMissingColumns) {
    const warnings = validateCoursesAndSchedules_();
    if (warnings.length === 0) {
      showAlert_('✅ Validación Exitosa\n\nTodas las pestañas y encabezados requeridos están presentes en el libro.');
    } else {
      showAlert_('⚠️ Estructura correcta, pero hay advertencias de cursos/horarios:\n\n' + warnings.map(w => '  • ' + w).join('\n'));
    }
    return;
  }

  // Construir mensaje descriptivo de errores detectados
  const errorReport = ['❌ Errores de Estructura Detectados:'];

  if (hasMissingSheets) {
    errorReport.push('\n📌 Pestañas Faltantes:');
    missingSheets.forEach(s => errorReport.push(`  • ${s}`));
  }

  if (hasMissingColumns) {
    errorReport.push('\n📌 Columnas/Encabezados Faltantes:');
    Object.keys(missingColumnsMap).forEach(s => {
      errorReport.push(`  • En "${s}": faltan (${missingColumnsMap[s].join(', ')})`);
    });
  }

  errorReport.push('\nPor favor, cree las pestañas o columnas faltantes para corregir la estructura.');

  const fullErrorMessage = errorReport.join('\n');
  showAlert_(fullErrorMessage);
}

/**
 * Verificación de solo lectura de la hoja Configuracion (ejecutar desde el editor de Apps Script).
 * Comprueba: CONFIG.SHEETS.CONFIG, CONFIG.REQUIRED_HEADERS['Configuracion'] (clave, valor, descripcion)
 * y, si hay libro activo, que la hoja exista con esos encabezados. No modifica nada.
 * @returns {{ok:boolean, problems:Array<string>, sheetChecked:boolean}}
 */
function checkConfiguracionSetup() {
  const problems = [];
  const expected = ['clave', 'valor', 'descripcion'];

  if (CONFIG.SHEETS.CONFIG !== 'Configuracion') {
    problems.push('CONFIG.SHEETS.CONFIG no está definido como "Configuracion".');
  }
  const headers = CONFIG.REQUIRED_HEADERS['Configuracion'];
  if (!Array.isArray(headers) || headers.join('|') !== expected.join('|')) {
    problems.push('CONFIG.REQUIRED_HEADERS["Configuracion"] debe ser [clave, valor, descripcion].');
  }

  let sheetChecked = false;
  if (problems.length === 0) {
    let sheet = null;
    try {
      sheet = getSheetByName_(CONFIG.SHEETS.CONFIG);
      sheetChecked = true;
    } catch (e) {
      Logger.log('No se pudo acceder al libro activo para verificar la hoja Configuracion: ' + e.message);
    }
    if (sheetChecked) {
      if (!sheet) {
        problems.push('Falta la hoja "Configuracion" (ejecute Asistencia > Preparar estructura o seedTestData()).');
      } else {
        const actual = getSheetHeaders_(sheet);
        const missing = expected.filter(h => actual.indexOf(h) === -1);
        if (missing.length > 0) problems.push('La hoja "Configuracion" no tiene los encabezados: ' + missing.join(', ') + '.');
      }
    }
  }

  const result = { ok: problems.length === 0, problems: problems, sheetChecked: sheetChecked };
  Logger.log('checkConfiguracionSetup: ' + JSON.stringify(result));
  return result;
}

