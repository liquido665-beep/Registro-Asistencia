/**
 * SummaryService.gs - Resumen semanal de asistencia (lunes a viernes)
 *
 * HOJAS UTILIZADAS
 *   Lee:      Niveles, Estudiantes, Asistencias, Usuarios, Asignaciones, Configuracion
 *   Escribe:  Resumenes (copia/referencia de cada resumen) y Auditoria
 *
 * ALCANCE (todas las opciones son opcionales y combinables):
 *   referenceDate  fecha dentro de la semana a resumir (por defecto hoy)
 *   startDate+endDate  rango personalizado (solo se cuentan días lunes-viernes)
 *   levelId        un curso (ID existente o sugerido)
 *   jornada        'Mañana' | 'Tarde' | 'Noche'
 *   grado          nivel (1, 2, 3)
 *   teacherEmail   cursos asignados a un docente (hoja Asignaciones)
 *   send           false para no enviar correo
 *
 * IDEMPOTENCIA: cada resumen tiene una "clave" (semana + alcance). Si ya existe en Resumenes
 * no se vuelve a generar ni a enviar (se audita como RESUMEN_SEMANAL_OMITIDO).
 *
 * CORREO (opcional): destinatarios separados por coma en Configuracion, clave
 * "resumen_semanal_destinatarios". Sin destinatarios no se envía nada (solo se guarda).
 */

/**
 * Punto de entrada del trigger semanal (viernes, a partir de las 22:40: después del cierre de la jornada
 * Noche; ver getWeeklySummaryRunTime_). Incluye todas las jornadas de la semana, también Noche.
 * ADVERTENCIA: como el resumen es idempotente por semana+alcance, un resumen MANUAL global generado antes
 * de ese momento impide que el automático se genere (quedaría sin los datos tardíos del viernes). Genere
 * resúmenes manuales de la semana en curso solo después de esa hora, o use un alcance/rango distinto.
 */
function runWeeklyAttendanceSummary() {
  return generateWeeklySummary({ source: 'TRIGGER' });
}

/**
 * Lee un valor de la hoja Configuracion.
 * @param {string} key
 * @returns {string}
 */
function getConfigValue_(key) {
  const row = getSheetRowsAsObjects_(CONFIG.SHEETS.CONFIG).find(r => String(r.clave).trim() === key);
  return row && !isBlank_(row.valor) ? String(row.valor).trim() : '';
}

function describeSummaryScope_(opts) {
  const parts = [];
  if (opts.levelId) parts.push('curso=' + String(opts.levelId).trim());
  if (opts.jornada) parts.push('jornada=' + String(opts.jornada).trim());
  if (opts.grado) parts.push('nivel=' + String(opts.grado).trim());
  if (opts.teacherEmail) parts.push('docente=' + normalizeEmail_(opts.teacherEmail));
  return parts.length ? parts.join('|') : 'GLOBAL';
}

/**
 * Genera el resumen de asistencia, lo guarda en la hoja Resumenes, lo envía (si hay destinatarios)
 * y lo audita. Evita duplicados por clave.
 * @param {Object} [options] Ver cabecera.
 * @returns {Object} { status: 'created'|'duplicate', clave, range, totals, emailSent, ... }
 */
function generateWeeklySummary(options) {
  const opts = options || {};
  const actor = getActorEmail_(opts.actor);

  if (!getSheetByName_(CONFIG.SHEETS.SUMMARIES)) {
    throw new AppError('Falta la hoja "Resumenes". Ejecute Asistencia > Preparar estructura.', 'MISSING_SHEET');
  }
  if (opts.jornada && !isValidJornada_(opts.jornada)) {
    throw new AppError(`Jornada inválida: "${opts.jornada}".`, 'INVALID_JORNADA');
  }

  let range;
  if (opts.startDate || opts.endDate) {
    if (!(opts.startDate && opts.endDate)) throw new AppError('Debe indicar startDate y endDate.', 'BAD_REQUEST');
    range = { start: formatDateISO_(opts.startDate), end: formatDateISO_(opts.endDate) };
    if (range.start > range.end) throw new AppError('La fecha de inicio no puede ser posterior a la de término.', 'BAD_REQUEST');
  } else {
    range = getWeekRange_(opts.referenceDate ? formatDateISO_(opts.referenceDate) : formatDateISO_(new Date()));
  }

  const scope = describeSummaryScope_(opts);
  const clave = `SEM-${range.start}_${range.end}-${scope}`;

  const lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    const existing = getSheetRowsAsObjects_(CONFIG.SHEETS.SUMMARIES).find(r => String(r.clave) === clave);
    if (existing) {
      writeAudit_(CONFIG.AUDIT_ACTIONS.RESUMEN_SEMANAL_OMITIDO, CONFIG.SHEETS.SUMMARIES, clave,
        'Resumen ya generado previamente; se omite para evitar duplicados.', actor);
      return { status: 'duplicate', clave: clave, summaryId: existing.id_resumen, range: range, scope: scope };
    }

    const data = buildWeeklySummaryData_(range, opts);
    const summaryId = Utilities.getUuid();

    // Envío opcional por correo
    const recipients = parseSummaryRecipients_();
    let emailSent = false;
    if (opts.send !== false && recipients.length > 0) {
      try {
        MailApp.sendEmail({
          to: recipients.join(','),
          subject: `Resumen semanal de asistencia ${range.start} al ${range.end}${scope === 'GLOBAL' ? '' : ' [' + scope + ']'}`,
          body: buildSummaryText_(data, scope)
        });
        emailSent = true;
      } catch (mailError) {
        writeAuditError_(CONFIG.AUDIT_ACTIONS.RESUMEN_SEMANAL_ERROR_ENVIO, CONFIG.SHEETS.SUMMARIES, clave, mailError, { destinatarios: recipients.length }, actor);
      }
    }

    // Copia del resumen en la hoja Resumenes
    let json = JSON.stringify(data);
    if (json.length > CONFIG.SUMMARY.MAX_JSON_CHARS) {
      json = JSON.stringify({ range: data.range, totals: data.totals, byCourse: data.byCourse, nota: 'Detalle truncado por tamaño.' });
      if (json.length > CONFIG.SUMMARY.MAX_JSON_CHARS) json = json.substring(0, CONFIG.SUMMARY.MAX_JSON_CHARS);
    }

    appendRowData_(CONFIG.SHEETS.SUMMARIES, {
      id_resumen: summaryId,
      clave: clave,
      semana_inicio: range.start,
      semana_fin: range.end,
      alcance: scope,
      generado_por: opts.source === 'TRIGGER' ? 'SISTEMA' : actor,
      timestamp: new Date(),
      total_registros: data.totals.total,
      porcentaje_asistencia: data.totals.total > 0 ? data.totals.attendancePercent : '',
      alumnos_con_ausencias: data.totals.studentsWithAbsences,
      destinatarios: emailSent ? recipients.join(', ') : '',
      detalle_json: json
    });

    writeAudit_(CONFIG.AUDIT_ACTIONS.RESUMEN_SEMANAL_GENERADO, CONFIG.SHEETS.SUMMARIES, clave, {
      resumenId: summaryId,
      semana: `${range.start} al ${range.end}`,
      alcance: scope,
      registros: data.totals.total,
      porcentaje: data.totals.attendancePercent,
      correoEnviado: emailSent
    }, actor);

    return {
      status: 'created',
      clave: clave,
      summaryId: summaryId,
      range: range,
      scope: scope,
      totals: data.totals,
      emailSent: emailSent
    };
  } finally {
    lock.releaseLock();
  }
}

/**
 * @returns {Array<string>} Correos válidos configurados para el resumen.
 */
function parseSummaryRecipients_() {
  return getConfigValue_(CONFIG.SUMMARY.RECIPIENTS_CONFIG_KEY)
    .split(',')
    .map(s => s.trim())
    .filter(s => isValidEmail_(s));
}

/**
 * Agrega registros (lunes a viernes) por curso, jornada, nivel y docente.
 * @param {{start:string,end:string}} range
 * @param {Object} opts Filtros de alcance.
 * @returns {Object}
 */
function buildWeeklySummaryData_(range, opts) {
  const days = listWeekdaysBetween_(range.start, range.end);
  const courses = getCourses_();
  const students = getSheetRowsAsObjects_(CONFIG.SHEETS.STUDENTS);
  const users = getSheetRowsAsObjects_(CONFIG.SHEETS.USERS);
  const assignments = getSheetRowsAsObjects_(CONFIG.SHEETS.ASSIGNMENTS);

  // Cursos dentro del alcance
  let scoped = courses.filter(isCourseActive_);
  if (opts.levelId) {
    const target = findCourseRow_(opts.levelId, courses);
    if (!target) throw new AppError(`No existe el curso "${opts.levelId}".`, 'NOT_FOUND');
    scoped = scoped.filter(c => String(c.id_nivel).trim() === String(target.id_nivel).trim());
  }
  if (opts.grado) {
    scoped = scoped.filter(c => String(c.grado) === String(opts.grado).trim());
  }
  if (opts.teacherEmail) {
    const teacher = users.find(u => normalizeEmail_(u.email) === normalizeEmail_(opts.teacherEmail));
    if (!teacher) throw new AppError(`No existe el docente "${opts.teacherEmail}".`, 'NOT_FOUND');
    const teacherCourseIds = {};
    assignments.filter(a => String(a.id_usuario) === String(teacher.id_usuario)).forEach(a => {
      const c = findCourseRow_(a.id_nivel, courses);
      if (c) teacherCourseIds[String(c.id_nivel).trim()] = true;
    });
    scoped = scoped.filter(c => teacherCourseIds[String(c.id_nivel).trim()]);
  }

  const courseById = {};
  scoped.forEach(c => { courseById[String(c.id_nivel).trim()] = c; });

  const studentCourse = {};
  const studentsPerCourse = {};
  students.forEach(s => {
    const c = findCourseRow_(s.id_nivel, courses);
    if (!c) return;
    const cid = String(c.id_nivel).trim();
    studentCourse[String(s.id_estudiante)] = cid;
    studentsPerCourse[cid] = (studentsPerCourse[cid] || 0) + 1;
  });

  // Registros del rango (solo lunes a viernes) dentro del alcance
  const records = [];
  getSheetRowsAsObjects_(CONFIG.SHEETS.ATTENDANCE).forEach(r => {
    let dateStr;
    try {
      dateStr = formatDateISO_(r.fecha);
    } catch (e) {
      return;
    }
    if (dateStr < range.start || dateStr > range.end || !isAttendanceDay_(dateStr)) return;

    const cid = studentCourse[String(r.id_estudiante)];
    if (!cid || !courseById[cid]) return;

    const effectiveJornada = String(r.jornada || '').trim() || String(courseById[cid].jornada || '').trim();
    if (opts.jornada && effectiveJornada !== String(opts.jornada).trim()) return;

    records.push({ estado: r.estado, studentId: String(r.id_estudiante), courseId: cid, date: dateStr, jornada: effectiveJornada });
  });

  const slim = m => ({
    total: m.total, present: m.present, absent: m.absent, late: m.late,
    justified: m.justified, attendancePercent: m.attendancePercent
  });
  const countStudentsWithAbsences = list => {
    const set = {};
    list.forEach(r => { if (String(r.estado).trim() === CONFIG.ATTENDANCE_STATUS.ABSENT) set[r.studentId] = true; });
    return Object.keys(set).length;
  };

  // Por curso
  const byCourse = scoped.map(c => {
    const cid = String(c.id_nivel).trim();
    const list = records.filter(r => r.courseId === cid);
    const datesWithRecords = {};
    list.forEach(r => { datesWithRecords[r.date] = true; });
    return Object.assign({
      courseId: cid,
      name: c.nombre_nivel,
      jornada: String(c.jornada || '').trim(),
      grado: c.grado,
      students: studentsPerCourse[cid] || 0,
      studentsWithAbsences: countStudentsWithAbsences(list),
      daysWithoutRecords: days.length - Object.keys(datesWithRecords).length
    }, slim(calculateAttendanceMetrics_(list)));
  });

  // Por jornada (jornada vigente al registrar)
  const jornadaNames = {};
  records.forEach(r => { jornadaNames[r.jornada || '(sin jornada)'] = true; });
  const byJornada = Object.keys(jornadaNames).map(j => {
    const list = records.filter(r => (r.jornada || '(sin jornada)') === j);
    return Object.assign({ jornada: j, studentsWithAbsences: countStudentsWithAbsences(list) }, slim(calculateAttendanceMetrics_(list)));
  });

  // Por nivel (grado)
  const gradoNames = {};
  scoped.forEach(c => { gradoNames[String(c.grado)] = true; });
  const byGrado = Object.keys(gradoNames).map(g => {
    const ids = {};
    scoped.filter(c => String(c.grado) === g).forEach(c => { ids[String(c.id_nivel).trim()] = true; });
    const list = records.filter(r => ids[r.courseId]);
    return Object.assign({ grado: g, studentsWithAbsences: countStudentsWithAbsences(list) }, slim(calculateAttendanceMetrics_(list)));
  });

  // Por docente (según Asignaciones; un curso puede aparecer en varios docentes)
  const teacherCourses = {};
  assignments.forEach(a => {
    const c = findCourseRow_(a.id_nivel, courses);
    if (!c || !courseById[String(c.id_nivel).trim()]) return;
    const key = String(a.id_usuario);
    teacherCourses[key] = teacherCourses[key] || {};
    teacherCourses[key][String(c.id_nivel).trim()] = true;
  });
  const byTeacher = Object.keys(teacherCourses).map(userId => {
    const u = users.find(x => String(x.id_usuario) === userId);
    const list = records.filter(r => teacherCourses[userId][r.courseId]);
    return Object.assign({
      teacher: u ? u.nombre_completo : userId,
      courses: Object.keys(teacherCourses[userId]),
      studentsWithAbsences: countStudentsWithAbsences(list)
    }, slim(calculateAttendanceMetrics_(list)));
  });

  const totals = Object.assign(
    { studentsWithAbsences: countStudentsWithAbsences(records), schoolDays: days.length },
    slim(calculateAttendanceMetrics_(records))
  );

  return { range: range, totals: totals, byCourse: byCourse, byJornada: byJornada, byGrado: byGrado, byTeacher: byTeacher };
}

/**
 * @param {Object} data Resultado de buildWeeklySummaryData_.
 * @param {string} scope
 * @returns {string} Texto plano para correo.
 */
function buildSummaryText_(data, scope) {
  const pct = m => (m.total > 0 ? `${m.attendancePercent}%` : 'sin registros');
  const lines = [
    `RESUMEN SEMANAL DE ASISTENCIA (lunes a viernes)`,
    `Período: ${data.range.start} al ${data.range.end}  |  Alcance: ${scope}`,
    ``,
    `TOTAL: ${data.totals.total} registros | Asistencia ${pct(data.totals)} | Presentes ${data.totals.present}, Ausentes ${data.totals.absent}, Atrasados ${data.totals.late}, Justificados ${data.totals.justified}`,
    `Alumnos con ausencias: ${data.totals.studentsWithAbsences}`,
    ``,
    `POR CURSO:`
  ];
  data.byCourse.forEach(c => {
    lines.push(`  • ${c.name} (${c.jornada || 'sin jornada'}): ${pct(c)} | Aus ${c.absent} | Atr ${c.late} | Just ${c.justified} | Días sin registro: ${c.daysWithoutRecords}`);
  });
  lines.push('', 'POR JORNADA:');
  data.byJornada.forEach(j => lines.push(`  • ${j.jornada}: ${pct(j)} (${j.total} registros)`));
  lines.push('', 'POR NIVEL:');
  data.byGrado.forEach(g => lines.push(`  • ${g.grado}° Nivel: ${pct(g)} (${g.total} registros)`));
  if (data.byTeacher.length) {
    lines.push('', 'POR DOCENTE:');
    data.byTeacher.forEach(t => lines.push(`  • ${t.teacher}: ${pct(t)} (${t.total} registros)`));
  }
  return lines.join('\n');
}

/**
 * Acción de menú: genera el resumen de la semana actual y muestra el resultado.
 */
function generateWeeklySummaryFromMenu() {
  try {
    const r = generateWeeklySummary({ source: 'MENU' });
    if (r.status === 'duplicate') {
      showAlert_(`ℹ️ El resumen ${r.range.start} al ${r.range.end} ya existe en la hoja "${CONFIG.SHEETS.SUMMARIES}". No se duplicó.`);
    } else {
      showAlert_(`✅ Resumen generado (${r.range.start} al ${r.range.end}).\nRegistros: ${r.totals.total}\nAsistencia: ${r.totals.total > 0 ? r.totals.attendancePercent + '%' : 'sin registros'}\nCorreo enviado: ${r.emailSent ? 'sí' : 'no'}`);
    }
  } catch (e) {
    showError_(e);
  }
}
