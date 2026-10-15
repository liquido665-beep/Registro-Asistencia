/**
 * Main.gs - Punto de Entrada y Menú Contextual UI
 * 
 * Cumple con los requisitos del menú:
 * - Menú llamado exactamente "Asistencia"
 * - Opción llamada exactamente "Validar estructura"
 *
 * El endpoint HTTP para AppSheet (doPost) está en Webhook.gs.
 */

/**
 * Trigger ejecutado al abrir el documento de Google Sheets.
 * Construye el menú de la aplicación de manera no destructiva.
 */
function onOpen() {
  try {
    SpreadsheetApp.getUi()
      .createMenu('Asistencia')
      .addItem('Validar estructura', 'validateWorkbook')
      .addItem('Preparar estructura (no destructivo)', 'prepareStructure')
      .addSeparator()
      .addItem('Cambiar jornada de un curso', 'promptChangeCourseJornada')
      .addItem('Ver horarios de jornadas', 'showJornadaSchedules')
      .addItem('Generar reporte de curso', 'promptExportLevelReport')
      .addItem('Generar resumen semanal', 'generateWeeklySummaryFromMenu')
      .addSeparator()
      .addItem('Instalar disparadores automáticos', 'setupSystemTriggers')
      .addItem('Probar bitácora de auditoría', 'testAudit')
      .addToUi();
  } catch (e) {
    Logger.log('Menú contextual no cargado (interfaz UI no disponible en este entorno): ' + e.message);
  }
}

/**
 * Solcita al usuario el ID de nivel y genera el informe de asistencia correspondiente.
 */
function promptExportLevelReport() {
  try {
    const ui = SpreadsheetApp.getUi();
    const response = ui.prompt('Generar Reporte de Asistencia', 'Ingrese el ID o nombre del curso/nivel:', ui.ButtonSet.OK_CANCEL);
    
    if (response.getSelectedButton() === ui.Button.OK) {
      const levelId = response.getResponseText().trim();
      if (levelId) {
        exportLevelReportToSheet(levelId);
      } else {
        showAlert_('⚠️ Debe ingresar un ID de nivel válido.');
      }
    }
  } catch (e) {
    Logger.log('Error al solicitar ID de nivel: ' + e.message);
  }
}

/**
 * Pide ID de curso y nueva jornada y ejecuta el cambio (solo Administrador).
 */
function promptChangeCourseJornada() {
  try {
    const ui = SpreadsheetApp.getUi();
    const jornadas = Object.keys(CONFIG.SCHEDULES).join(', ');

    const idResponse = ui.prompt('Cambiar jornada de un curso', 'ID del curso (ej: CUR-1A):', ui.ButtonSet.OK_CANCEL);
    if (idResponse.getSelectedButton() !== ui.Button.OK) return;

    const jornadaResponse = ui.prompt('Cambiar jornada de un curso', `Nueva jornada (${jornadas}):`, ui.ButtonSet.OK_CANCEL);
    if (jornadaResponse.getSelectedButton() !== ui.Button.OK) return;

    const result = changeCourseJornada(idResponse.getResponseText().trim(), jornadaResponse.getResponseText().trim());
    showAlert_(result.changed
      ? `✅ Jornada del curso ${result.courseId} cambiada de "${result.previous || 'sin asignar'}" a "${result.current}".\n\nAplica a las próximas tomas de asistencia; el historial no se modifica.`
      : `ℹ️ El curso ${result.courseId} ya tenía la jornada "${result.current}". Sin cambios.`);
  } catch (e) {
    showError_(e);
  }
}

/**
 * Muestra el detalle de bloques y recesos de las jornadas Mañana, Tarde y Noche
 * (lunes a jueves y viernes). Solo lectura.
 */
function showJornadaSchedules() {
  try {
    const problems = validateScheduleConfig_();
    if (problems.length > 0) {
      showAlert_('⚠️ La configuración de horarios tiene problemas:\n\n' + problems.map(p => '  • ' + p).join('\n'));
      return;
    }
    showAlert_('🕒 Horarios de las jornadas\n\n' + formatAllJornadaSchedules_());
  } catch (e) {
    showError_(e);
  }
}

/**
 * Helper seguro para mostrar alertas en pantalla o registrarlas en el Log si no hay interfaz UI disponible.
 * @param {string} message Mensaje a desplegar.
 */
function showAlert_(message) {
  try {
    SpreadsheetApp.getUi().alert(message);
  } catch (e) {
    Logger.log('[ALERTA DE SISTEMA]:\n' + message);
  }
}

/**
 * Muestra un error: el mensaje completo si es un AppError; genérico si es interno (el detalle va al Log).
 * @param {Error} err
 */
function showError_(err) {
  if (err && err.clientSafe) {
    showAlert_('❌ ' + err.message);
  } else {
    Logger.log('Error interno: ' + (err && err.message));
    showAlert_('❌ Ocurrió un error inesperado. Revise los registros de ejecución de Apps Script.');
  }
}
