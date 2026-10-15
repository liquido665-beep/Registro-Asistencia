/**
 * CourseService.gs - Gestión de cursos (hoja Niveles), jornadas y mapeo de IDs
 *
 * HOJA UTILIZADA: CONFIG.SHEETS.LEVELS ("Niveles")
 *   id_nivel | nombre_nivel | grado | seccion | jornada | estado | fecha_creacion | fecha_modificacion
 *   grado = número de nivel (1, 2, 3); seccion = letra.
 *
 * IDs: se CONSERVAN los IDs existentes en la hoja. CONFIG.LEGACY_COURSE_ID_MAP relaciona
 * IDs previos (N-101...) con los sugeridos (CUR-1A...) y todas las búsquedas aceptan ambos.
 *
 * Cambio de jornada: solo afecta tomas de asistencia FUTURAS. Los registros históricos no se
 * tocan (cada registro guarda la jornada vigente al momento de registrarse).
 */

/**
 * @param {*} value
 * @returns {boolean} True si la celda está vacía.
 */
function isBlank_(value) {
  return value === '' || value === null || value === undefined;
}

/**
 * @param {*} text
 * @returns {string} Texto en minúsculas, sin espacios duplicados.
 */
function normalizeText_(text) {
  return String(text === undefined || text === null ? '' : text).trim().toLowerCase().replace(/\s+/g, ' ');
}

/**
 * @returns {Array<Object>} Filas de la hoja Niveles.
 */
function getCourses_() {
  return getSheetRowsAsObjects_(CONFIG.SHEETS.LEVELS);
}

/**
 * Devuelve todos los IDs equivalentes de un curso (existente <-> sugerido).
 * @param {string} anyId
 * @returns {Array<string>}
 */
function getCourseIdAliases_(anyId) {
  const id = String(anyId === undefined || anyId === null ? '' : anyId).trim();
  if (!id) return [];
  const map = CONFIG.LEGACY_COURSE_ID_MAP;
  const aliases = [id];
  if (map[id]) aliases.push(map[id]);
  Object.keys(map).forEach(legacyId => {
    if (map[legacyId] === id) aliases.push(legacyId);
  });
  return aliases;
}

/**
 * Busca la fila de un curso por cualquiera de sus IDs equivalentes.
 * @param {string} anyId
 * @param {Array<Object>} [coursesList] Lista precargada (evita relecturas).
 * @returns {Object|null}
 */
function findCourseRow_(anyId, coursesList) {
  const list = coursesList || getCourses_();
  const aliases = getCourseIdAliases_(anyId);
  for (let i = 0; i < aliases.length; i++) {
    const found = list.find(c => String(c.id_nivel).trim() === aliases[i]);
    if (found) return found;
  }
  return null;
}

/**
 * @param {string} anyId
 * @returns {string|null} ID real (el existente en la hoja) o null.
 */
function resolveCourseId_(anyId) {
  const row = findCourseRow_(anyId);
  return row ? String(row.id_nivel).trim() : null;
}

/**
 * @param {Object} course Fila de Niveles.
 * @returns {boolean} True si el curso está Activo (celda vacía se considera Activo por compatibilidad).
 */
function isCourseActive_(course) {
  const st = String(course.estado === undefined || course.estado === null ? '' : course.estado).trim();
  return st === '' || st === CONFIG.COURSE_STATUS.ACTIVE;
}

/**
 * Valida que un curso pueda recibir asistencia en la fecha indicada y retorna su jornada.
 * @param {Object} course Fila de Niveles.
 * @param {string} dateStr 'YYYY-MM-DD'.
 * @param {Object} [opts] { time: 'HH:mm', jornada: string }
 * @returns {string} Jornada vigente del curso.
 */
function assertCourseAcceptsAttendance_(course, dateStr, opts) {
  const o = opts || {};
  const courseName = course.nombre_nivel || course.id_nivel;

  if (!isCourseActive_(course)) {
    throw new AppError(`El curso "${courseName}" está inactivo.`, 'COURSE_INACTIVE');
  }

  const jornada = String(course.jornada === undefined || course.jornada === null ? '' : course.jornada).trim();
  if (!isValidJornada_(jornada)) {
    throw new AppError(
      `El curso "${courseName}" no tiene una jornada válida asignada (${Object.keys(CONFIG.SCHEDULES).join(', ')}). Ejecute Asistencia > Preparar estructura o asígnela.`,
      'INVALID_JORNADA'
    );
  }

  if (o.jornada && String(o.jornada).trim() !== jornada) {
    throw new AppError(
      `El curso "${courseName}" pertenece a la jornada ${jornada}, no a ${String(o.jornada).trim()}.`,
      'JORNADA_MISMATCH'
    );
  }

  let time = o.time ? String(o.time).trim() : '';
  if (!time && CONFIG.ATTENDANCE_RULES.ENFORCE_CURRENT_TIME_WINDOW && dateStr === formatDateISO_(new Date())) {
    time = getCurrentTimeHHmm_();
  }

  if (time) {
    if (!isValidTimeFormat_(time)) {
      throw new AppError(`Hora inválida: "${time}". Se requiere HH:mm (24 h).`, 'INVALID_TIME');
    }
    const win = getScheduleWindow_(jornada, dateStr);
    if (!win || !isTimeWithinJornada_(jornada, dateStr, time)) {
      throw new AppError(
        `La hora ${time} está fuera del horario de la jornada ${jornada} para el ${dateStr}` +
        (win ? ` (${win.start} - ${win.end}).` : '.'),
        'OUT_OF_SCHEDULE'
      );
    }
  }

  return jornada;
}

/**
 * Tabla de mapeo entre IDs existentes en la hoja y los IDs sugeridos del catálogo.
 * @returns {Array<{idSugerido:string, idExistente:(string|null), nombreCatalogo:string, nombreEnHoja:(string|null), coincideId:boolean}>}
 */
function getCourseIdMapping() {
  const courses = getCourses_();
  return CONFIG.COURSE_CATALOG.map(entry => {
    const row = findCourseRow_(entry.id, courses);
    return {
      idSugerido: entry.id,
      idExistente: row ? String(row.id_nivel).trim() : null,
      nombreCatalogo: entry.nombre,
      nombreEnHoja: row ? row.nombre_nivel : null,
      coincideId: !!row && String(row.id_nivel).trim() === entry.id
    };
  });
}

/**
 * @param {Object} entry Entrada del catálogo.
 * @param {Date} now
 * @returns {Object} Objeto listo para appendRowData_.
 */
function buildCourseRowObject_(entry, now) {
  return {
    id_nivel: entry.id,
    nombre_nivel: entry.nombre,
    grado: entry.grado,
    seccion: entry.seccion,
    jornada: entry.jornada,
    estado: CONFIG.COURSE_STATUS.ACTIVE,
    fecha_creacion: now,
    fecha_modificacion: now
  };
}

/**
 * Crea los cursos del catálogo que no existan y completa campos vacíos de los existentes.
 * NO borra, renombra ni cambia IDs. Un curso existente que coincida por ID, alias o nombre se conserva.
 *
 * @param {string} [actorEmail]
 * @returns {{created:Array<string>, updated:Array<string>, kept:Array<string>, warnings:Array<string>, mapping:Array<Object>}}
 */
function ensureCourses(actorEmail) {
  const actor = getActorEmail_(actorEmail);
  const now = new Date();
  const result = { created: [], updated: [], kept: [], warnings: [], mapping: [] };

  const problems = validateScheduleConfig_();
  if (problems.length > 0) {
    throw new AppError('Configuración de horarios inválida: ' + problems.join(' | '), 'INVALID_SCHEDULE_CONFIG');
  }

  let courses = getCourses_();

  CONFIG.COURSE_CATALOG.forEach(entry => {
    const row = findCourseRow_(entry.id, courses) ||
      courses.find(c => normalizeText_(c.nombre_nivel) === normalizeText_(entry.nombre));

    if (!row) {
      appendRowData_(CONFIG.SHEETS.LEVELS, buildCourseRowObject_(entry, now));
      writeAudit_(CONFIG.AUDIT_ACTIONS.CREAR_CURSO, CONFIG.SHEETS.LEVELS, entry.id, {
        nombre: entry.nombre, jornada: entry.jornada, origen: 'catalogo_inicial'
      }, actor);
      result.created.push(entry.id);
      result.mapping.push({ existente: entry.id, sugerido: entry.id });
      courses = getCourses_();
      return;
    }

    const patch = {};
    if (isBlank_(row.nombre_nivel)) patch.nombre_nivel = entry.nombre;
    if (isBlank_(row.grado)) patch.grado = entry.grado;
    if (isBlank_(row.seccion)) patch.seccion = entry.seccion;
    if (isBlank_(row.jornada)) patch.jornada = entry.jornada;
    if (isBlank_(row.estado)) patch.estado = CONFIG.COURSE_STATUS.ACTIVE;
    if (isBlank_(row.fecha_creacion)) patch.fecha_creacion = now;

    if (Object.keys(patch).length > 0) {
      patch.fecha_modificacion = now;
      updateRowData_(CONFIG.SHEETS.LEVELS, row._rowIndex, patch);
      writeAudit_(CONFIG.AUDIT_ACTIONS.MODIFICAR_CURSO, CONFIG.SHEETS.LEVELS, row.id_nivel, {
        camposCompletados: Object.keys(patch).filter(k => k !== 'fecha_modificacion'), origen: 'catalogo_inicial'
      }, actor);
      result.updated.push(String(row.id_nivel));
    } else {
      result.kept.push(String(row.id_nivel));
    }

    result.mapping.push({ existente: String(row.id_nivel).trim(), sugerido: entry.id });

    if (!isBlank_(row.nombre_nivel) && normalizeText_(row.nombre_nivel) !== normalizeText_(entry.nombre)) {
      result.warnings.push(`El curso ${row.id_nivel} se llama "${row.nombre_nivel}" en la hoja y "${entry.nombre}" en el catálogo (se conserva el de la hoja).`);
    }
  });

  return result;
}

/**
 * Crea un curso nuevo. Solo Administrador.
 * @param {Object} data { id?, nombre?, grado, seccion, jornada, estado? }
 * @param {string} [actorEmail]
 * @returns {Object} Curso creado.
 */
function createCourse(data, actorEmail) {
  const actor = getActorEmail_(actorEmail);
  assertRole_(actor, [CONFIG.ROLES.ADMIN], 'crear cursos');

  const grado = Number(data && data.grado);
  const seccion = String((data && data.seccion) || '').trim().toUpperCase();
  if (!Number.isInteger(grado) || grado < 1) throw new AppError('El grado (nivel) debe ser un número entero mayor o igual a 1.', 'INVALID_COURSE');
  if (!/^[A-Z]$/.test(seccion)) throw new AppError('La sección debe ser una letra (A-Z).', 'INVALID_COURSE');

  const jornada = String((data && data.jornada) || '').trim();
  if (!isValidJornada_(jornada)) throw new AppError(`Jornada inválida: "${jornada}". Válidas: ${Object.keys(CONFIG.SCHEDULES).join(', ')}.`, 'INVALID_JORNADA');

  const estado = String((data && data.estado) || CONFIG.COURSE_STATUS.ACTIVE).trim();
  if (Object.values(CONFIG.COURSE_STATUS).indexOf(estado) === -1) throw new AppError(`Estado inválido: "${estado}".`, 'INVALID_COURSE');

  const id = String((data && data.id) || `CUR-${grado}${seccion}`).trim();
  const nombre = String((data && data.nombre) || `${grado}° Nivel ${seccion}`).trim();

  const lock = LockService.getScriptLock();
  lock.waitLock(15000);
  try {
    const courses = getCourses_();
    if (findCourseRow_(id, courses)) throw new AppError(`Ya existe un curso con ID "${id}".`, 'DUPLICATE');
    if (courses.some(c => normalizeText_(c.nombre_nivel) === normalizeText_(nombre))) {
      throw new AppError(`Ya existe un curso llamado "${nombre}".`, 'DUPLICATE');
    }

    const now = new Date();
    appendRowData_(CONFIG.SHEETS.LEVELS, {
      id_nivel: id, nombre_nivel: nombre, grado: grado, seccion: seccion,
      jornada: jornada, estado: estado, fecha_creacion: now, fecha_modificacion: now
    });
    writeAudit_(CONFIG.AUDIT_ACTIONS.CREAR_CURSO, CONFIG.SHEETS.LEVELS, id, { nombre, jornada, estado, origen: 'manual' }, actor);
    return { success: true, courseId: id, name: nombre, jornada: jornada, estado: estado };
  } finally {
    lock.releaseLock();
  }
}

/**
 * Cambia la jornada de un curso. Solo Administrador.
 * - Valida que la jornada exista y que CONFIG.SCHEDULES sea coherente.
 * - Solo afecta asistencias futuras; no modifica registros históricos.
 * - Registra el cambio en Auditoria (anterior, nueva, actor).
 *
 * @param {string} courseId ID del curso (existente o sugerido).
 * @param {string} newJornada 'Mañana' | 'Tarde' | 'Noche'.
 * @param {string} [actorEmail] Email del administrador (por defecto el usuario activo).
 * @returns {Object} { success, changed, courseId, previous, current }
 */
function changeCourseJornada(courseId, newJornada, actorEmail) {
  const actor = getActorEmail_(actorEmail);
  assertRole_(actor, [CONFIG.ROLES.ADMIN], 'cambiar la jornada de un curso');

  const jornada = String(newJornada === undefined || newJornada === null ? '' : newJornada).trim();
  if (!isValidJornada_(jornada)) {
    throw new AppError(`Jornada inválida: "${jornada}". Válidas: ${Object.keys(CONFIG.SCHEDULES).join(', ')}.`, 'INVALID_JORNADA');
  }

  const scheduleProblems = validateScheduleConfig_();
  if (scheduleProblems.length > 0) {
    throw new AppError('El horario de la jornada no es coherente: ' + scheduleProblems.join(' | '), 'INVALID_SCHEDULE_CONFIG');
  }

  const lock = LockService.getScriptLock();
  lock.waitLock(15000);
  try {
    const course = findCourseRow_(courseId);
    if (!course) throw new AppError(`No existe el curso "${courseId}".`, 'NOT_FOUND');

    const previous = String(course.jornada === undefined || course.jornada === null ? '' : course.jornada).trim();
    if (previous === jornada) {
      return { success: true, changed: false, courseId: course.id_nivel, previous: previous, current: jornada };
    }

    updateRowData_(CONFIG.SHEETS.LEVELS, course._rowIndex, {
      jornada: jornada,
      fecha_modificacion: new Date()
    });

    writeAudit_(CONFIG.AUDIT_ACTIONS.CAMBIAR_JORNADA_CURSO, CONFIG.SHEETS.LEVELS, course.id_nivel, {
      curso: course.nombre_nivel,
      jornadaAnterior: previous || '(sin asignar)',
      jornadaNueva: jornada,
      estadoCurso: course.estado || CONFIG.COURSE_STATUS.ACTIVE,
      nota: 'Aplica a tomas de asistencia futuras; no se modificaron registros históricos.'
    }, actor);

    return { success: true, changed: true, courseId: course.id_nivel, previous: previous, current: jornada };
  } finally {
    lock.releaseLock();
  }
}

/**
 * Revisa coherencia de cursos y horarios (solo lectura).
 * @returns {Array<string>} Advertencias (vacía si todo está bien).
 */
function validateCoursesAndSchedules_() {
  const warnings = validateScheduleConfig_();
  const seen = {};

  getCourses_().forEach(c => {
    const id = String(c.id_nivel).trim();
    if (seen[id]) warnings.push(`ID de curso duplicado: ${id}.`);
    seen[id] = true;

    if (!isValidJornada_(c.jornada)) {
      warnings.push(`Curso ${id}: jornada vacía o inválida ("${c.jornada}").`);
    }
    const st = String(c.estado === undefined || c.estado === null ? '' : c.estado).trim();
    if (st !== '' && Object.values(CONFIG.COURSE_STATUS).indexOf(st) === -1) {
      warnings.push(`Curso ${id}: estado inválido ("${st}").`);
    }
  });

  return warnings;
}
