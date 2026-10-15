/**
 * ReportService.gs - Generación de métricas, alertas de riesgo y reportes de asistencia escolar
 * 
 * Funcionalidades:
 * - Cálculo numérico de porcentajes de asistencia por alumno, curso/nivel e institución.
 * - Identificación de estudiantes en riesgo de repitencia/inasistencia crítica (< 85%).
 * - Generación y formateo automático de informes tabulares en Google Sheets.
 * - Registro de auditoría para cada informe generado.
 */

/**
 * Calcula estadísticas cuantitativas a partir de un arreglo de registros de asistencia.
 * 
 * @param {Array<Object>} records Registros de asistencia del estudiante.
 * @returns {Object} Objeto con contadores y porcentaje calculado.
 */
function calculateAttendanceMetrics_(records) {
  let presentCount = 0;
  let absentCount = 0;
  let lateCount = 0;
  let justifiedCount = 0;

  records.forEach(r => {
    const st = String(r.estado).trim();
    if (st === CONFIG.ATTENDANCE_STATUS.PRESENT) presentCount++;
    else if (st === CONFIG.ATTENDANCE_STATUS.ABSENT) absentCount++;
    else if (st === CONFIG.ATTENDANCE_STATUS.LATE) lateCount++;
    else if (st === CONFIG.ATTENDANCE_STATUS.JUSTIFIED) justifiedCount++;
    else presentCount++; // Estado por defecto si no es reconocido
  });

  const totalCount = records.length;
  // Consideramos computable como presente: Presente + Atrasado + Justificado
  const attendedCount = presentCount + lateCount + justifiedCount;
  const attendancePercent = totalCount > 0 
    ? Math.round((attendedCount / totalCount) * 10000) / 100 
    : 100.0;

  const threshold = CONFIG.REPORTS ? CONFIG.REPORTS.CRITICAL_THRESHOLD_PERCENT : 85.0;
  const isAtRisk = totalCount > 0 && attendancePercent < threshold;

  return {
    total: totalCount,
    present: presentCount,
    absent: absentCount,
    late: lateCount,
    justified: justifiedCount,
    attendancePercent: attendancePercent,
    isAtRisk: isAtRisk
  };
}

/**
 * Genera el reporte de asistencia de un estudiante específico en un período determinado.
 * 
 * @param {string} studentId ID del estudiante.
 * @param {Date|string} [startDate] Fecha de inicio.
 * @param {Date|string} [endDate] Fecha de fin.
 * @returns {Object} Reporte detallado del estudiante.
 */
function getStudentAttendanceReport(studentId, startDate, endDate) {
  if (!studentId) throw new Error('El ID de estudiante es obligatorio.');

  const students = getSheetRowsAsObjects_(CONFIG.SHEETS.STUDENTS);
  const student = students.find(s => String(s.id_estudiante) === String(studentId));
  if (!student) throw new Error(`Estudiante con ID "${studentId}" no fue encontrado.`);

  const studentRecords = getAttendanceForStudent(studentId, startDate, endDate);
  const metrics = calculateAttendanceMetrics_(studentRecords);

  return {
    studentId: student.id_estudiante,
    rut: student.rut_dni,
    fullName: `${student.nombres} ${student.apellidos}`.trim(),
    levelId: student.id_nivel,
    period: {
      startDate: startDate ? formatDateISO_(startDate) : 'Inicio Registros',
      endDate: endDate ? formatDateISO_(endDate) : 'Hoy'
    },
    metrics: metrics
  };
}

/**
 * Genera el reporte consolidado de asistencia de un curso/nivel completo.
 * 
 * @param {string} levelId ID del curso/nivel.
 * @param {Date|string} [startDate] Fecha de inicio.
 * @param {Date|string} [endDate] Fecha de término.
 * @param {{courses:Array<Object>, students:Array<Object>, attendanceIndex:Object}} [shared] Datos ya leídos
 *   (cursos, alumnos, índice de buildAttendanceIndexByStudent_) para reutilizarlos entre varios cursos.
 * @returns {Object} Reporte resumido del nivel y lista de métricas por alumno.
 */
function getLevelAttendanceReport(levelId, startDate, endDate, shared) {
  if (!levelId) throw new Error('El ID del nivel/curso es obligatorio.');

  // Datos leídos UNA vez (o reutilizados del llamador): cursos, alumnos e índice de asistencias.
  const sharedData = shared || {};
  const courses = sharedData.courses || getCourses_();
  const allStudents = sharedData.students || getSheetRowsAsObjects_(CONFIG.SHEETS.STUDENTS);
  const attendanceIndex = sharedData.attendanceIndex || buildAttendanceIndexByStudent_();

  const levelObj = findCourseRow_(levelId, courses);
  const levelName = levelObj ? levelObj.nombre_nivel : levelId;
  const levelAliases = getCourseIdAliases_(levelObj ? levelObj.id_nivel : levelId);

  const students = allStudents
    .filter(s => levelAliases.indexOf(String(s.id_nivel).trim()) !== -1);

  let totalLevelPercentSum = 0;
  let studentsAtRiskCount = 0;
  const studentsReport = [];

  students.forEach(student => {
    const studentRecords = getAttendanceForStudent(student.id_estudiante, startDate, endDate, attendanceIndex);
    const metrics = calculateAttendanceMetrics_(studentRecords);

    totalLevelPercentSum += metrics.attendancePercent;
    if (metrics.isAtRisk) studentsAtRiskCount++;

    studentsReport.push({
      studentId: student.id_estudiante,
      rut: student.rut_dni,
      fullName: `${student.nombres} ${student.apellidos}`.trim(),
      metrics: metrics
    });
  });

  const avgAttendancePercent = students.length > 0
    ? Math.round((totalLevelPercentSum / students.length) * 100) / 100
    : 100.0;

  return {
    levelId: levelId,
    levelName: levelName,
    totalStudents: students.length,
    averageAttendancePercent: avgAttendancePercent,
    studentsAtRiskCount: studentsAtRiskCount,
    period: {
      startDate: startDate ? formatDateISO_(startDate) : 'Inicio Registros',
      endDate: endDate ? formatDateISO_(endDate) : 'Hoy'
    },
    studentsReport: studentsReport
  };
}

/**
 * Genera y exporta un informe formateado en una nueva pestaña de Google Sheets ('Reporte_Asistencia').
 * 
 * @param {string} levelId ID del nivel/curso a reportar.
 * @param {Date|string} [startDate] Fecha inicio.
 * @param {Date|string} [endDate] Fecha fin.
 */
function exportLevelReportToSheet(levelId, startDate, endDate) {
  const reportData = getLevelAttendanceReport(levelId, startDate, endDate);
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheetName = CONFIG.REPORTS ? CONFIG.REPORTS.REPORT_SHEET_NAME : 'Reporte_Asistencia';

  let sheet = ss.getSheetByName(sheetName);
  if (sheet) {
    sheet.clear();
  } else {
    sheet = ss.insertSheet(sheetName);
  }

  // Título e información general
  sheet.getRange('A1:H1').merge()
    .setValue(`REPORTE DE ASISTENCIA ESCOLAR - ${reportData.levelName.toUpperCase()}`)
    .setFontWeight('bold')
    .setFontSize(14)
    .setBackground('#1B365D')
    .setFontColor('#FFFFFF')
    .setHorizontalAlignment('center');

  sheet.getRange('A2:H2').merge()
    .setValue(`Período: ${reportData.period.startDate} al ${reportData.period.endDate} | Promedio Curso: ${reportData.averageAttendancePercent}% | Alumnos en Riesgo (<85%): ${reportData.studentsAtRiskCount}`)
    .setFontStyle('italic')
    .setBackground('#E8EEF5')
    .setHorizontalAlignment('center');

  // Encabezados de tabla
  const headers = ['RUT / DNI', 'Nombre Completo', 'Presentes', 'Ausentes', 'Atrasados', 'Justificados', 'Total Días', '% Asistencia'];
  sheet.getRange(4, 1, 1, headers.length)
    .setValues([headers])
    .setFontWeight('bold')
    .setBackground('#2C3E50')
    .setFontColor('#FFFFFF')
    .setHorizontalAlignment('center');

  // Filas de alumnos
  const rowsToInsert = reportData.studentsReport.map(item => [
    item.rut,
    item.fullName,
    item.metrics.present,
    item.metrics.absent,
    item.metrics.late,
    item.metrics.justified,
    item.metrics.total,
    `${item.metrics.attendancePercent}%`
  ]);

  if (rowsToInsert.length > 0) {
    const dataRange = sheet.getRange(5, 1, rowsToInsert.length, headers.length);
    dataRange.setValues(rowsToInsert);

    // Resaltar en rojo claro a alumnos en riesgo (< 85%)
    reportData.studentsReport.forEach((item, index) => {
      if (item.metrics.isAtRisk) {
        sheet.getRange(5 + index, 1, 1, headers.length).setBackground('#FADBD8');
      }
    });
  }

  sheet.autoResizeColumns(1, headers.length);

  // Registro de auditoría
  writeAudit_(
    'GENERAR_REPORTE_ASISTENCIA',
    sheetName,
    levelId,
    `Generado reporte de asistencia para curso ${reportData.levelName}. Promedio: ${reportData.averageAttendancePercent}%. Alumnos en riesgo: ${reportData.studentsAtRiskCount}.`
  );

  showAlert_(`✅ Reporte de Asistencia Generado con Éxito\n\nCurso: ${reportData.levelName}\nPromedio Curso: ${reportData.averageAttendancePercent}%\nAlumnos en Riesgo: ${reportData.studentsAtRiskCount}\n\nRevise la pestaña "${sheetName}".`);
}
