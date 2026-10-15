/**
 * AttendanceService.gs - Lógica de negocio para toma y gestión de asistencia escolar
 * 
 * Funcionalidades:
 * - Registro individual de asistencia con detección de duplicados por alumno y fecha.
 * - Registro masivo por curso/nivel.
 * - Consultas por estudiante y por nivel/fecha.
 * - Reglas: solo lunes a viernes; el curso debe estar Activo y con jornada válida; si se informa
 *   la hora, debe estar dentro del horario de la jornada del curso (CONFIG.SCHEDULES).
 * - Cada registro guarda la jornada vigente del curso al momento de registrarse (histórico estable).
 * - Registro inmutable de auditoría para cada modificación.
 *
 * ARQUITECTURA (lectura/escritura)
 * - Cada operación pública (recordAttendance, recordBulkAttendance) valida el rol, toma UN solo
 *   bloqueo (withScriptLock_), carga Estudiantes, Niveles y Asistencias UNA vez en un contexto en
 *   memoria (loadAttendanceContext_), planifica todas las operaciones sin escribir
 *   (planAttendanceRecord_) y recién después escribe en lote (commitAttendanceOps_).
 * - Las funciones internas (sufijo _) nunca adquieren el bloqueo: lo reciben ya tomado del llamador.
 *   Así JustificationService puede reutilizarlas dentro de su propio bloqueo sin anidar bloqueos.
 * - Si la escritura falla a mitad de camino se deshace (rollback) y no quedan datos parciales.
 */

/**
 * Normaliza cualquier entrada de fecha (Date o String) al formato estándar 'YYYY-MM-DD'.
 * @param {Date|string} dateInput Fecha como objeto Date o cadena.
 * @returns {string} Fecha formateada en 'YYYY-MM-DD'.
 */
function formatDateISO_(dateInput) {
  if (!dateInput) {
    return Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd');
  }
  if (dateInput instanceof Date) {
    return Utilities.formatDate(dateInput, Session.getScriptTimeZone(), 'yyyy-MM-dd');
  }
  const str = String(dateInput).trim();
  if (str.match(/^\d{4}-\d{2}-\d{2}$/)) {
    return str;
  }
  const parsed = new Date(str);
  if (!isNaN(parsed.getTime())) {
    return Utilities.formatDate(parsed, Session.getScriptTimeZone(), 'yyyy-MM-dd');
  }
  throw new AppError(`Formato de fecha inválido: "${dateInput}". Se requiere YYYY-MM-DD.`, 'INVALID_DATE');
}

/**
 * Validar si el estado de asistencia es uno de los permitidos por la configuración.
 * @param {string} status Estado a evaluar.
 * @returns {boolean} True si es un estado válido.
 */
function isValidAttendanceStatus_(status) {
  const validStatuses = Object.values(CONFIG.ATTENDANCE_STATUS);
  return validStatuses.includes(status);
}

// ── Contexto en memoria, planificación y escritura en lote ───────────────────

/**
 * @param {string|number} studentId
 * @param {string} dateStr 'YYYY-MM-DD'
 * @returns {string} Clave única alumno+fecha.
 */
function attendanceKey_(studentId, dateStr) {
  return String(studentId) + '|' + dateStr;
}

/**
 * Lee UNA vez las hojas necesarias para registrar asistencia y arma índices en memoria:
 *   studentById  id_estudiante -> fila de Estudiantes
 *   courses      filas de Niveles
 *   byKey        "id_estudiante|fecha" -> fila existente de Asistencias
 * Llamar con el bloqueo del script tomado (lectura + decisión + escritura sin condiciones de carrera).
 * @returns {{studentById:Object, courses:Array<Object>, byKey:Object, pending:Object, ops:Array<Object>, assigned:(Object|null)}}
 */
function loadAttendanceContext_() {
  const studentById = {};
  getSheetRowsAsObjects_(CONFIG.SHEETS.STUDENTS).forEach(s => {
    const id = String(s.id_estudiante);
    if (!studentById[id]) studentById[id] = s; // como find(): gana la primera coincidencia
  });

  const byKey = {};
  getSheetRowsAsObjects_(CONFIG.SHEETS.ATTENDANCE).forEach(row => {
    if (isBlank_(row.fecha) || isBlank_(row.id_estudiante)) return;
    let dateStr;
    try {
      dateStr = formatDateISO_(row.fecha);
    } catch (e) {
      return; // fila con fecha ilegible: no participa del índice
    }
    const key = attendanceKey_(row.id_estudiante, dateStr);
    if (!byKey[key]) byKey[key] = row;
  });

  return { studentById: studentById, courses: getCourses_(), byKey: byKey, pending: {}, ops: [], assigned: null };
}

/**
 * @param {Object} user Fila de Usuarios.
 * @returns {boolean} True si el rol es Docente (único rol limitado a sus cursos asignados).
 */
function isTeacherUser_(user) {
  return !!user && String(user.rol).trim() === CONFIG.ROLES.TEACHER;
}

/**
 * Valida UN registro de asistencia contra el contexto y lo agrega a ctx.ops (NO escribe en hojas).
 * Lanza AppError si el registro no es válido. Un mismo alumno+fecha repetido en el lote reutiliza
 * la operación pendiente (el último valor gana, sin duplicar filas).
 *
 * @param {Object} ctx Contexto de loadAttendanceContext_.
 * @param {{studentId:string, status:string, observation:string}} item
 * @param {string} dateStr Fecha ya validada 'YYYY-MM-DD' (lunes a viernes).
 * @param {Object} opts { mode, time, jornada, actor }
 * @param {Object} user Fila de Usuarios del actor (para limitar al Docente a sus cursos).
 * @returns {Object} La operación (nueva o pendiente actualizada).
 */
function planAttendanceRecord_(ctx, item, dateStr, opts, user) {
  const mode = opts.mode || 'upsert';
  const studentId = item.studentId;
  const status = item.status;

  if (!studentId) {
    throw new AppError('El ID del estudiante (studentId) es obligatorio.', 'MISSING_FIELD');
  }
  if (!isValidAttendanceStatus_(status)) {
    throw new AppError(`Estado de asistencia inválido: "${status}". Válidos: ${Object.values(CONFIG.ATTENDANCE_STATUS).join(', ')}.`, 'INVALID_STATUS');
  }

  const student = ctx.studentById[String(studentId)];
  if (!student) {
    throw new AppError(`El estudiante con ID "${studentId}" no está registrado en el sistema.`, 'NOT_FOUND');
  }

  if (isTeacherUser_(user)) {
    ctx.assigned = ctx.assigned || getAssignedCourseIds_(user);
    if (!getCourseIdAliases_(student.id_nivel).some(id => ctx.assigned[id] === true)) {
      throw new AppError('El docente no tiene asignado el curso de este estudiante.', 'FORBIDDEN');
    }
  }

  const course = findCourseRow_(student.id_nivel, ctx.courses);
  if (!course) {
    throw new AppError(`El curso "${student.id_nivel}" del estudiante no existe en la hoja Niveles.`, 'NOT_FOUND');
  }
  const jornada = assertCourseAcceptsAttendance_(course, dateStr, { time: opts.time, jornada: opts.jornada });

  const actor = getActorEmail_(opts.actor);
  const timestampStr = new Date().toISOString();
  const cleanObservation = item.observation ? String(item.observation).trim() : '';
  const key = attendanceKey_(studentId, dateStr);

  const pending = ctx.pending[key];
  if (pending) {
    if (mode === 'create') {
      throw new AppError(`Ya existe un registro de asistencia para el estudiante ${studentId} el ${dateStr}. Use la actualización.`, 'DUPLICATE');
    }
    const fields = { estado: status, observacion: cleanObservation, registrado_por: actor, timestamp: timestampStr };
    Object.assign(pending.type === 'CREATE' ? pending.record : pending.patch, fields);
    return pending;
  }

  const existing = ctx.byKey[key];
  let op;
  if (existing) {
    if (mode === 'create') {
      throw new AppError(`Ya existe un registro de asistencia para el estudiante ${studentId} el ${dateStr}. Use la actualización.`, 'DUPLICATE');
    }
    const keptJornada = existing.jornada ? existing.jornada : jornada; // se conserva la jornada original
    op = {
      type: 'UPDATE',
      studentId: studentId,
      date: dateStr,
      rowIndex: existing._rowIndex,
      attendanceId: existing.id_asistencia,
      previousStatus: existing.estado,
      previous: {
        estado: existing.estado,
        observacion: existing.observacion,
        registrado_por: existing.registrado_por,
        timestamp: existing.timestamp,
        jornada: existing.jornada
      },
      patch: { estado: status, observacion: cleanObservation, registrado_por: actor, timestamp: timestampStr, jornada: keptJornada }
    };
  } else {
    if (mode === 'update') {
      throw new AppError(`No existe un registro de asistencia del estudiante ${studentId} el ${dateStr} para actualizar.`, 'NOT_FOUND');
    }
    const newId = Utilities.getUuid();
    op = {
      type: 'CREATE',
      studentId: studentId,
      date: dateStr,
      attendanceId: newId,
      record: {
        id_asistencia: newId,
        id_estudiante: studentId,
        fecha: dateStr,
        estado: status,
        observacion: cleanObservation,
        registrado_por: actor,
        timestamp: timestampStr,
        jornada: jornada
      }
    };
  }

  ctx.pending[key] = op;
  ctx.ops.push(op);
  return op;
}

/**
 * Escribe las operaciones planificadas: actualizaciones fila a fila y TODAS las altas con una sola
 * escritura. Si algo falla se deshace lo ya escrito y se relanza el error (sin datos parciales).
 * Requiere el bloqueo del script tomado por el llamador. No audita (ver auditAttendanceOps_).
 *
 * @param {Array<Object>} ops Operaciones de planAttendanceRecord_.
 * @returns {{created:number, updated:number, rollback:function():void}} rollback sirve para que el
 *   llamador deshaga estas escrituras si un paso posterior de SU transacción falla.
 */
function commitAttendanceOps_(ops) {
  const undo = [];
  const rollback = () => {
    for (let i = undo.length - 1; i >= 0; i--) {
      try {
        undo[i]();
      } catch (e) {
        Logger.log('No se pudo deshacer un paso de la escritura de asistencia: ' + e.message);
      }
    }
    undo.length = 0;
  };

  const updates = ops.filter(op => op.type === 'UPDATE');
  const creates = ops.filter(op => op.type === 'CREATE');

  try {
    updates.forEach(op => {
      updateRowData_(CONFIG.SHEETS.ATTENDANCE, op.rowIndex, op.patch);
      undo.push(() => updateRowData_(CONFIG.SHEETS.ATTENDANCE, op.rowIndex, op.previous));
    });
    if (creates.length > 0) {
      const startRow = appendRowsData_(CONFIG.SHEETS.ATTENDANCE, creates.map(op => op.record));
      undo.push(() => deleteRows_(CONFIG.SHEETS.ATTENDANCE, startRow, creates.length));
    }
  } catch (e) {
    rollback();
    throw e;
  }

  return { created: creates.length, updated: updates.length, rollback: rollback };
}

/**
 * Escribe (en lote) un evento de auditoría por cada operación confirmada. Nunca lanza excepciones.
 * @param {Array<Object>} ops
 * @param {string} actor Email del actor.
 */
function auditAttendanceOps_(ops, actor) {
  writeAuditBatch_(ops.map(op => {
    if (op.type === 'CREATE') {
      return {
        action: CONFIG.AUDIT_ACTIONS.CREAR_ASISTENCIA,
        tableName: CONFIG.SHEETS.ATTENDANCE,
        recordId: op.attendanceId,
        detail: `Registrada asistencia para estudiante ${op.studentId} en fecha ${op.date}: estado=${op.record.estado} (jornada ${op.record.jornada})`,
        actor: actor
      };
    }
    return {
      action: CONFIG.AUDIT_ACTIONS.EDITAR_ASISTENCIA,
      tableName: CONFIG.SHEETS.ATTENDANCE,
      recordId: op.attendanceId,
      detail: `Actualizada asistencia para estudiante ${op.studentId} en fecha ${op.date}: estado ${op.previousStatus} -> ${op.patch.estado} (jornada ${op.patch.jornada})`,
      actor: actor
    };
  }));
}

/**
 * @param {Object} op Operación de planAttendanceRecord_.
 * @returns {Object} Resultado público de recordAttendance.
 */
function buildAttendanceResult_(op) {
  const data = op.type === 'CREATE' ? op.record : op.patch;
  return {
    success: true,
    action: op.type === 'CREATE' ? 'CREATED' : 'UPDATED',
    attendanceId: op.attendanceId,
    studentId: op.studentId,
    date: op.date,
    status: data.estado,
    jornada: data.jornada,
    observation: data.observacion
  };
}

// ── API pública ──────────────────────────────────────────────────────────────

/**
 * Registra o actualiza la asistencia individual de un estudiante para una fecha dada.
 *
 * ROLES: Administrador, Docente, Inspector (CONFIG.SERVICE_ROLES.recordAttendance). Un Docente solo
 * puede registrar alumnos de cursos que tenga en Asignaciones.
 * 
 * @param {string} studentId ID único del estudiante (id_estudiante).
 * @param {Date|string} dateInput Fecha de la asistencia (solo lunes a viernes).
 * @param {string} status Estado: 'Presente', 'Ausente', 'Atrasado' o 'Justificado'.
 * @param {string} [observation=''] Observación opcional del profesor.
 * @param {Object} [options] Opciones:
 *   - mode: 'upsert' (por defecto) | 'create' (falla si ya existe) | 'update' (falla si no existe)
 *   - time: 'HH:mm' hora del registro; si se informa debe caer dentro de la jornada del curso
 *   - jornada: si se informa debe coincidir con la jornada vigente del curso
 *   - actor: email de quien registra (webhook); por defecto el usuario activo
 *   - user: fila de Usuarios ya validada por el llamador (webhook), evita releer la hoja
 * @returns {Object} Resultado de la operación con datos del registro.
 */
function recordAttendance(studentId, dateInput, status, observation, options) {
  const opts = options || {};
  const mode = opts.mode || 'upsert';

  const user = requireServiceRole_('recordAttendance', opts.actor, opts.user);

  if (['upsert', 'create', 'update'].indexOf(mode) === -1) {
    throw new AppError(`Modo de registro inválido: "${mode}".`, 'INVALID_MODE');
  }
  if (!studentId) {
    throw new AppError('El ID del estudiante (studentId) es obligatorio.', 'MISSING_FIELD');
  }
  if (!isValidAttendanceStatus_(status)) {
    throw new AppError(`Estado de asistencia inválido: "${status}". Válidos: ${Object.values(CONFIG.ATTENDANCE_STATUS).join(', ')}.`, 'INVALID_STATUS');
  }

  const formattedDate = formatDateISO_(dateInput);
  assertAttendanceDay_(formattedDate);

  const actor = getActorEmail_(opts.actor);

  // Sección crítica: lectura + decisión + escritura sin condiciones de carrera
  return withScriptLock_(() => {
    const ctx = loadAttendanceContext_();
    const op = planAttendanceRecord_(ctx, { studentId: studentId, status: status, observation: observation }, formattedDate, opts, user);
    commitAttendanceOps_(ctx.ops);
    auditAttendanceOps_(ctx.ops, actor);
    return buildAttendanceResult_(op);
  });
}

/**
 * Registra asistencia masiva para una lista de estudiantes en una misma fecha.
 *
 * ROLES: Administrador, Docente, Inspector (CONFIG.SERVICE_ROLES.recordBulkAttendance).
 * ASIGNACIÓN: si el actor es Docente, TODOS los alumnos existentes del lote deben pertenecer a cursos
 * que tenga asignados; si no, se aborta con FORBIDDEN y no se escribe ningún registro.
 * RENDIMIENTO: Estudiantes, Niveles, Asignaciones y Asistencias se leen una sola vez para todo el lote
 * y las altas se escriben con una sola operación.
 * ERRORES POR REGISTRO (estudiante inexistente, estado inválido, etc.): se informan en `errors` y
 * los registros válidos del lote sí se guardan (comportamiento previo).
 * 
 * @param {Array<Object>} recordsList Lista de objetos [{ studentId, status, observation }].
 * @param {Date|string} dateInput Fecha de asistencia aplicable a todo el lote (lunes a viernes).
 * @param {Object} [options] Mismas opciones que recordAttendance (time, jornada, actor, user).
 * @returns {Object} Resumen con métricas del proceso masivo.
 */
function recordBulkAttendance(recordsList, dateInput, options) {
  if (!Array.isArray(recordsList) || recordsList.length === 0) {
    throw new AppError('La lista de registros de asistencia no puede estar vacía.', 'MISSING_FIELD');
  }

  const baseOpts = options || {};
  const user = requireServiceRole_('recordBulkAttendance', baseOpts.actor, baseOpts.user);

  const formattedDate = formatDateISO_(dateInput);
  assertAttendanceDay_(formattedDate);

  const actor = getActorEmail_(baseOpts.actor);
  const itemOpts = { time: baseOpts.time, jornada: baseOpts.jornada, actor: baseOpts.actor };

  return withScriptLock_(() => {
    const ctx = loadAttendanceContext_();

    // 1) Todo o nada: un Docente solo puede registrar cursos asignados.
    if (isTeacherUser_(user)) {
      ctx.assigned = getAssignedCourseIds_(user);
      const denied = {};
      recordsList.forEach(item => {
        const student = ctx.studentById[String((item || {}).studentId)];
        if (!student) return; // el estudiante inexistente se informa por registro
        if (!getCourseIdAliases_(student.id_nivel).some(id => ctx.assigned[id] === true)) {
          denied[String(student.id_nivel).trim()] = true;
        }
      });
      const deniedCourses = Object.keys(denied);
      if (deniedCourses.length > 0) {
        throw new AppError(
          `El docente no tiene asignado(s) el/los curso(s): ${deniedCourses.join(', ')}. No se registró ningún alumno.`,
          'FORBIDDEN'
        );
      }
    }

    // 2) Planificar todo en memoria (sin escribir).
    const errors = [];
    recordsList.forEach((item, index) => {
      const it = item || {};
      try {
        planAttendanceRecord_(ctx, { studentId: it.studentId, status: it.status, observation: it.observation || '' }, formattedDate, itemOpts, user);
      } catch (err) {
        errors.push({ index: index, studentId: it.studentId, error: err.message });
      }
    });

    // 3) Escribir en lote y auditar.
    const committed = commitAttendanceOps_(ctx.ops);
    auditAttendanceOps_(ctx.ops, actor);

    // Registro de auditoría para el evento masivo
    writeAudit_(
      CONFIG.AUDIT_ACTIONS.REGISTRO_MASIVO_ASISTENCIA,
      CONFIG.SHEETS.ATTENDANCE,
      `LOTE-${formattedDate}`,
      `Procesados: ${recordsList.length}, Creados: ${committed.created}, Actualizados: ${committed.updated}, Errores: ${errors.length}`,
      baseOpts.actor
    );

    return {
      success: errors.length === 0,
      date: formattedDate,
      totalProcessed: recordsList.length,
      createdCount: committed.created,
      updatedCount: committed.updated,
      errorCount: errors.length,
      errors: errors
    };
  });
}

/**
 * Índice en memoria de Asistencias por alumno: id_estudiante -> [{ row, date }] (orden de la hoja).
 * Lee la hoja UNA vez; pasarlo a getAttendanceForStudent evita releerla por cada alumno.
 * Las filas con fecha vacía o ilegible se omiten.
 * @returns {Object<string, Array<{row:Object, date:string}>>}
 */
function buildAttendanceIndexByStudent_() {
  const index = {};
  getSheetRowsAsObjects_(CONFIG.SHEETS.ATTENDANCE).forEach(row => {
    if (isBlank_(row.fecha) || isBlank_(row.id_estudiante)) return;
    let dateStr;
    try {
      dateStr = formatDateISO_(row.fecha);
    } catch (e) {
      return;
    }
    const k = String(row.id_estudiante);
    (index[k] = index[k] || []).push({ row: row, date: dateStr });
  });
  return index;
}

/**
 * Obtiene el historial completo de asistencias de un estudiante dentro de un rango de fechas.
 * 
 * @param {string} studentId ID del estudiante.
 * @param {Date|string} [startDate] Fecha inicio (opcional).
 * @param {Date|string} [endDate] Fecha fin (opcional).
 * @param {Object} [attendanceIndex] Índice de buildAttendanceIndexByStudent_(). Si se consultan varios
 *   alumnos en una misma operación (reportes, alertas) construirlo una vez y reutilizarlo; si se omite,
 *   se lee la hoja en esta llamada (comportamiento anterior).
 * @returns {Array<Object>} Lista de registros de asistencia.
 */
function getAttendanceForStudent(studentId, startDate, endDate, attendanceIndex) {
  if (!studentId) throw new AppError('El ID de estudiante es requerido.', 'MISSING_FIELD');

  const index = attendanceIndex || buildAttendanceIndexByStudent_();
  const startStr = startDate ? formatDateISO_(startDate) : null;
  const endStr = endDate ? formatDateISO_(endDate) : null;

  return (index[String(studentId)] || [])
    .filter(entry => {
      if (startStr && entry.date < startStr) return false;
      if (endStr && entry.date > endStr) return false;
      return true;
    })
    .map(entry => entry.row);
}

/**
 * Obtiene el estado de asistencia de un nivel (curso) en una fecha específica.
 * Incluye a los alumnos sin registro como 'Sin registrar'.
 * Acepta el ID existente o el sugerido del curso (ej: N-101 o CUR-1A).
 * 
 * @param {string} levelId ID del nivel/curso.
 * @param {Date|string} dateInput Fecha a consultar.
 * @returns {Array<Object>} Lista de alumnos con su estado de asistencia correspondiente.
 */
function getAttendanceByLevelAndDate(levelId, dateInput) {
  if (!levelId) throw new AppError('El ID de nivel es requerido.', 'MISSING_FIELD');

  const formattedDate = formatDateISO_(dateInput);
  const aliases = getCourseIdAliases_(levelId);

  // Obtener alumnos pertenecientes al nivel
  const students = getSheetRowsAsObjects_(CONFIG.SHEETS.STUDENTS)
    .filter(s => aliases.indexOf(String(s.id_nivel).trim()) !== -1);

  // Obtener asistencias registradas en la fecha
  const attendanceRecords = getSheetRowsAsObjects_(CONFIG.SHEETS.ATTENDANCE)
    .filter(a => formatDateISO_(a.fecha) === formattedDate);

  // Mapear asistencias por studentId para consulta O(1)
  const attendanceMap = {};
  attendanceRecords.forEach(a => {
    attendanceMap[String(a.id_estudiante)] = a;
  });

  return students.map(student => {
    const record = attendanceMap[String(student.id_estudiante)];
    return {
      studentId: student.id_estudiante,
      rut: student.rut_dni,
      fullName: `${student.nombres} ${student.apellidos}`.trim(),
      levelId: student.id_nivel,
      date: formattedDate,
      attendanceId: record ? record.id_asistencia : null,
      status: record ? record.estado : 'Sin registrar',
      observation: record ? record.observacion : '',
      registeredBy: record ? record.registrado_por : null
    };
  });
}
