/**
 * Triggers.gs - Disparadores automáticos, automatizaciones temporales y gestión de eventos
 *
 * Disparadores instalados por setupSystemTriggers():
 *  - runDailyAttendanceDigest      diario, hora CONFIG.TRIGGERS.DAILY_DIGEST_HOUR (23:00-24:00),
 *                                  solo actúa de lunes a viernes.
 *  - runWeeklyAttendanceSummary    viernes DESPUÉS del cierre real de la jornada Noche (22:10 fin de clases,
 *                                  22:20 fin del receso): se instala a 22:40 con nearMinute(40), o sea
 *                                  entre 22:40 y 22:55. Ver getWeeklySummaryRunTime_(). Ver SummaryService.gs.
 *  - runWeeklyAtRiskAlertDigest    viernes, misma hora, escaneo de alumnos con asistencia < 85%.
 *  - onEdit(e)                     trigger simple para trazabilidad de ediciones manuales.
 */

const SYSTEM_TRIGGER_HANDLERS_ = [
  'runDailyAttendanceDigest',
  'runWeeklyAttendanceSummary',
  'runWeeklyAtRiskAlertDigest'
];

/**
 * Instala automáticamente todos los disparadores temporales requeridos por el sistema.
 * Elimina versiones previas (solo las del sistema) para evitar duplicidad de ejecuciones.
 */
function setupSystemTriggers() {
  removeAllSystemTriggers();

  const dailyHour = CONFIG.TRIGGERS.DAILY_DIGEST_HOUR;
  const weekly = getWeeklySummaryRunTime_();

  ScriptApp.newTrigger('runDailyAttendanceDigest')
    .timeBased()
    .everyDays(1)
    .atHour(dailyHour)
    .create();

  ScriptApp.newTrigger('runWeeklyAttendanceSummary')
    .timeBased()
    .onWeekDay(ScriptApp.WeekDay.FRIDAY)
    .atHour(weekly.hour)
    .nearMinute(weekly.minute)
    .create();

  ScriptApp.newTrigger('runWeeklyAtRiskAlertDigest')
    .timeBased()
    .onWeekDay(ScriptApp.WeekDay.FRIDAY)
    .atHour(weekly.hour)
    .nearMinute(weekly.minute)
    .create();

  writeAudit_(
    CONFIG.AUDIT_ACTIONS.CONFIGURAR_DISPARADORES,
    'Sistema',
    'TRIGGERS-001',
    `Disparadores configurados (Resumen diario: ${dailyHour}:00 lun-vie; Resumen semanal y alerta de riesgo: viernes ${weekly.time}, tras el cierre de jornadas a las ${weekly.closesAt}).`
  );

  showAlert_(`✅ Disparadores automáticos instalados correctamente.\n\nResumen semanal y alerta de riesgo: viernes a partir de las ${weekly.time} (cierre de jornadas ${weekly.closesAt}).`);
}

/**
 * Elimina los disparadores del sistema (no toca disparadores ajenos al proyecto).
 */
function removeAllSystemTriggers() {
  const triggers = ScriptApp.getProjectTriggers().filter(t => SYSTEM_TRIGGER_HANDLERS_.indexOf(t.getHandlerFunction()) !== -1);
  triggers.forEach(trigger => ScriptApp.deleteTrigger(trigger));

  writeAudit_(
    CONFIG.AUDIT_ACTIONS.ELIMINAR_DISPARADORES,
    'Sistema',
    'TRIGGERS-000',
    `Eliminados ${triggers.length} disparadores del sistema.`
  );
}

/**
 * Tarea programada diaria: Verificación de cursos activos con asistencia registrada en el día.
 * No actúa sábado ni domingo.
 */
function runDailyAttendanceDigest() {
  const todayStr = formatDateISO_(new Date());
  if (!isAttendanceDay_(todayStr)) {
    Logger.log(`Resumen diario omitido: ${todayStr} no es día de asistencia (lunes a viernes).`);
    return;
  }

  const courses = getCourses_();
  const activeCourses = courses.filter(isCourseActive_);
  const students = getSheetRowsAsObjects_(CONFIG.SHEETS.STUDENTS);

  const courseIdByStudent = {};
  students.forEach(s => {
    const c = findCourseRow_(s.id_nivel, courses);
    if (c) courseIdByStudent[String(s.id_estudiante)] = String(c.id_nivel).trim();
  });

  const todayRecords = getSheetRowsAsObjects_(CONFIG.SHEETS.ATTENDANCE)
    .filter(a => formatDateISO_(a.fecha) === todayStr);

  const registeredCourseIds = {};
  todayRecords.forEach(a => {
    const cid = courseIdByStudent[String(a.id_estudiante)];
    if (cid) registeredCourseIds[cid] = true;
  });

  const missingCourses = activeCourses.filter(c => !registeredCourseIds[String(c.id_nivel).trim()]);
  const recordedCount = activeCourses.length - missingCourses.length;
  const missingNames = missingCourses.map(c => `${c.nombre_nivel} (${c.jornada || 'sin jornada'})`).join(', ') || 'Ninguno';

  writeAudit_(
    CONFIG.AUDIT_ACTIONS.RESUMEN_DIARIO_ASISTENCIA,
    CONFIG.SHEETS.ATTENDANCE,
    `RESUMEN-${todayStr}`,
    `Cursos registrados hoy (${todayStr}): ${recordedCount}/${activeCourses.length}. Cursos pendientes: ${missingNames}.`
  );

  Logger.log(`Resumen diario completado para ${todayStr}: ${recordedCount}/${activeCourses.length} cursos con asistencia.`);
}

/**
 * Tarea programada semanal: Escaneo automático de estudiantes en riesgo de repitencia (< 85%).
 */
function runWeeklyAtRiskAlertDigest() {
  const levels = getCourses_().filter(isCourseActive_);
  let totalStudentsScanned = 0;
  let totalAtRiskCount = 0;
  const atRiskList = [];

  // Lectura única compartida por todos los cursos (antes: una lectura de Asistencias por alumno).
  const shared = {
    courses: getCourses_(),
    students: getSheetRowsAsObjects_(CONFIG.SHEETS.STUDENTS),
    attendanceIndex: buildAttendanceIndexByStudent_()
  };

  levels.forEach((level) => {
    const report = getLevelAttendanceReport(level.id_nivel, undefined, undefined, shared);
    totalStudentsScanned += report.totalStudents;
    totalAtRiskCount += report.studentsAtRiskCount;

    report.studentsReport.forEach((st) => {
      if (st.metrics.isAtRisk) {
        atRiskList.push(`${st.fullName} (${level.nombre_nivel}): ${st.metrics.attendancePercent}%`);
      }
    });
  });

  const detailMsg = `Escaneados ${totalStudentsScanned} alumnos en ${levels.length} cursos. Alumnos en riesgo (<85%): ${totalAtRiskCount}. Alumnos: [${atRiskList.slice(0, 10).join("; ")}${atRiskList.length > 10 ? "..." : ""}]`;

  writeAudit_(
    CONFIG.AUDIT_ACTIONS.ALERTA_SEMANAL_RIESGO,
    CONFIG.SHEETS.ATTENDANCE,
    `ALERTA-${formatDateISO_(new Date())}`,
    detailMsg
  );

  Logger.log(`Alerta semanal completada. Total en riesgo: ${totalAtRiskCount}/${totalStudentsScanned}`);
}

/**
 * Trigger simple ejecutado al editar manualmente una celda en Google Sheets.
 * Registra trazabilidad si se editan celdas en hojas críticas (incluye Niveles: jornada de cursos).
 *
 * @param {Object} e Evento de edición de Google Sheets.
 */
function onEdit(e) {
  if (!e || !e.range) return;

  try {
    const sheet = e.range.getSheet();
    const sheetName = sheet.getName();

    const criticalSheets = [
      CONFIG.SHEETS.ATTENDANCE,
      CONFIG.SHEETS.JUSTIFICATIONS,
      CONFIG.SHEETS.USERS,
      CONFIG.SHEETS.LEVELS,
    ];

    if (criticalSheets.includes(sheetName)) {
      const row = e.range.getRow();
      // Omitir edición de encabezados (fila 1)
      if (row > 1) {
        const user = e.user
          ? e.user.getEmail()
          : Session.getActiveUser().getEmail() || "USUARIO_MANUAL";
        const oldValue = e.oldValue !== undefined ? e.oldValue : "";
        const newValue = e.value !== undefined ? e.value : "";

        writeAudit_(
          CONFIG.AUDIT_ACTIONS.EDICION_MANUAL_HOJA,
          sheetName,
          `FILA-${row}`,
          `Edición manual en celda ${e.range.getA1Notation()}: "${oldValue}" -> "${newValue}" por ${user}`,
          user
        );
      }
    }
  } catch (err) {
    Logger.log("Error en evento onEdit: " + err.message);
  }
}
