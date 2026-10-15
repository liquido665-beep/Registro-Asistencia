/**
 * Seed.gs - Script de inicialización para cargar datos de prueba en la planilla
 *
 * NO DESTRUCTIVO: si una pestaña ya contiene datos (más de la fila de encabezados) NO se toca.
 * Para volver a sembrar, elimine manualmente la pestaña. Al final ejecuta ensureSchema(), que
 * agrega columnas faltantes y completa el catálogo de cursos (CUR-1A ... CUR-3A).
 *
 * Ejecutar una vez en el editor de Apps Script o con: clasp run seedTestData
 */

function seedTestData() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const now = new Date();
  const H = CONFIG.REQUIRED_HEADERS;

  // Cursos desde el catálogo central (IDs estables CUR-xx)
  const courseRows = CONFIG.COURSE_CATALOG.map(c => [
    c.id, c.nombre, c.grado, c.seccion, c.jornada, CONFIG.COURSE_STATUS.ACTIVE, now, now
  ]);

  const sheetDefs = [
    {
      name: 'Usuarios',
      rows: [
        ['U-001', 'francisco.info@cepatagonia.cl', 'Francisco Admin', 'Administrador', 'Activo'],
        ['U-002', 'docente.perez@cepatagonia.cl', 'Carlos Pérez', 'Docente', 'Activo'],
        ['U-003', 'inspectora.gomez@cepatagonia.cl', 'Ana Gómez', 'Inspector', 'Activo']
      ]
    },
    { name: 'Niveles', rows: courseRows },
    {
      name: 'Estudiantes',
      rows: [
        ['E-1001', '23456789-1', 'Lucas', 'González Pérez', 'CUR-1A', 'apoderado.gonzalez@gmail.com'],
        ['E-1002', '23456789-2', 'Sofía', 'Rodríguez Silva', 'CUR-1A', 'apoderado.rodriguez@gmail.com'],
        ['E-1003', '23456789-3', 'Mateo', 'Fernández López', 'CUR-1A', 'apoderado.fernandez@gmail.com'],
        ['E-1004', '23456789-4', 'Valentina', 'Morales Díaz', 'CUR-1B', 'apoderado.morales@gmail.com'],
        ['E-1005', '23456789-5', 'Benjamín', 'Castro Torres', 'CUR-1B', 'apoderado.castro@gmail.com']
      ]
    },
    {
      name: 'Asignaciones',
      rows: [
        ['A-001', 'U-002', 'CUR-1A', 'Matemáticas', '2026-1'],
        ['A-002', 'U-002', 'CUR-1B', 'Matemáticas', '2026-1']
      ]
    },
    { name: 'Asistencias', rows: [] },
    { name: 'Justificativos', rows: [] },
    {
      name: 'Configuracion',
      rows: [
        ['version', '1.0.0', 'Versión del sistema'],
        ['threshold_asistencia', '85', 'Porcentaje mínimo de asistencia'],
        [CONFIG.SUMMARY.RECIPIENTS_CONFIG_KEY, '', 'Correos (separados por coma) que reciben el resumen semanal']
      ]
    },
    { name: 'Auditoria', rows: [] },
    { name: 'Resumenes', rows: [] }
  ];

  // Pre-validación (sin escribir nada): cada hoja a sembrar debe tener encabezados definidos y todas
  // sus filas semilla deben tener exactamente tantas columnas como encabezados.
  const seedProblems = [];
  sheetDefs.forEach(def => {
    const headers = H[def.name];
    if (!Array.isArray(headers) || headers.length === 0) {
      seedProblems.push(`"${def.name}": no hay encabezados en CONFIG.REQUIRED_HEADERS.`);
      return;
    }
    def.rows.forEach((row, i) => {
      if (row.length !== headers.length) {
        seedProblems.push(`"${def.name}" fila ${i + 1}: tiene ${row.length} columnas y se esperaban ${headers.length}.`);
      }
    });
  });
  if (seedProblems.length > 0) {
    throw new Error('Seed abortado antes de escribir (configuración inconsistente): ' + seedProblems.join(' | '));
  }

  const seeded = [];
  const skipped = [];

  sheetDefs.forEach(def => {
    const headers = H[def.name];
    let sheet = ss.getSheetByName(def.name);
    if (!sheet) {
      sheet = ss.insertSheet(def.name);
    } else if (sheet.getLastRow() > 1) {
      skipped.push(def.name);
      return;
    }

    sheet.getRange(1, 1, 1, headers.length)
      .setValues([headers])
      .setFontWeight('bold')
      .setBackground('#2C3E50')
      .setFontColor('#FFFFFF');

    if (def.rows.length > 0) {
      sheet.getRange(2, 1, def.rows.length, headers.length).setValues(def.rows);
    }
    seeded.push(def.name);
  });

  SpreadsheetApp.flush();
  const schema = ensureSchema();

  const msg = `✅ Seed completado. Cargadas: ${seeded.join(', ') || 'ninguna'}. Omitidas (ya tenían datos): ${skipped.join(', ') || 'ninguna'}. Cursos creados: ${schema.courses.created.length}.`;
  Logger.log(msg);
  return msg;
}
