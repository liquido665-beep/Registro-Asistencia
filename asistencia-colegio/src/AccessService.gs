/**
 * AccessService.gs - Errores de negocio y control de acceso por rol
 *
 * AppError: error con mensaje APTO para mostrarse al cliente (webhook/UI).
 * Cualquier otro tipo de error se considera interno y NO se expone en las respuestas.
 */

class AppError extends Error {
  /**
   * @param {string} message Mensaje seguro para el usuario.
   * @param {string} [code] Código corto (INVALID_DAY, FORBIDDEN, DUPLICATE, ...).
   */
  constructor(message, code) {
    super(message);
    this.name = 'AppError';
    this.code = code || 'ERROR';
    this.clientSafe = true;
  }
}

/**
 * @param {string} email
 * @returns {string} Email normalizado en minúsculas.
 */
function normalizeEmail_(email) {
  return String(email === undefined || email === null ? '' : email).trim().toLowerCase();
}

/**
 * @param {string} email
 * @returns {boolean}
 */
function isValidEmail_(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(email === undefined || email === null ? '' : email).trim());
}

/**
 * Busca un usuario por email en la hoja Usuarios.
 * @param {string} email
 * @returns {Object|null}
 */
function getUserByEmail_(email) {
  const target = normalizeEmail_(email);
  if (!target) return null;
  return getSheetRowsAsObjects_(CONFIG.SHEETS.USERS).find(u => normalizeEmail_(u.email) === target) || null;
}

/**
 * Exige que el email corresponda a un usuario registrado y Activo.
 * @param {string} email
 * @returns {Object} Fila de Usuarios.
 */
function getActiveUserOrThrow_(email) {
  const user = getUserByEmail_(email);
  if (!user) {
    throw new AppError('El usuario no está registrado en el sistema.', 'FORBIDDEN');
  }
  if (String(user.estado).trim() !== 'Activo') {
    throw new AppError('El usuario está inactivo.', 'FORBIDDEN');
  }
  return user;
}

/**
 * Núcleo ÚNICO de la comprobación de rol (lo usan assertRole_ y requireServiceRole_).
 * @param {Object} user Fila de Usuarios (ya validada como activa).
 * @param {Array<string>} allowedRoles Roles permitidos.
 * @param {string} actionLabel Descripción de la acción (para el mensaje).
 * @returns {Object} El mismo user.
 */
function assertUserHasRole_(user, allowedRoles, actionLabel) {
  const role = String(user.rol).trim();
  if (allowedRoles.indexOf(role) === -1) {
    throw new AppError(`El rol "${role}" no tiene permiso para ${actionLabel}.`, 'FORBIDDEN');
  }
  return user;
}

/**
 * Exige que el usuario tenga uno de los roles permitidos.
 * @param {string} email Email del actor.
 * @param {Array<string>} allowedRoles Roles permitidos.
 * @param {string} actionLabel Descripción de la acción (para el mensaje).
 * @returns {Object} Fila de Usuarios del actor.
 */
function assertRole_(email, allowedRoles, actionLabel) {
  return assertUserHasRole_(getActiveUserOrThrow_(email), allowedRoles, actionLabel);
}

/**
 * Validación de rol para las funciones de servicio (defensa en profundidad). Los roles permitidos
 * salen de CONFIG.SERVICE_ROLES[operation], la misma fuente que usa el webhook.
 *
 * LIMITACIÓN: fuera del webhook el actor se toma de Session.getActiveUser().getEmail(), que puede
 * venir vacío (disparadores temporales, ejecuciones anónimas). Si el actor no se puede identificar
 * la operación se RECHAZA (falla cerrado). El webhook siempre informa actor y usuario ya validados.
 *
 * @param {string} operation Clave de CONFIG.SERVICE_ROLES (ej: 'recordAttendance').
 * @param {string} [actorEmail] Email explícito del actor (webhook).
 * @param {Object} [knownUser] Fila de Usuarios ya validada por el llamador (evita releer la hoja).
 * @returns {Object} Fila de Usuarios del actor.
 */
function requireServiceRole_(operation, actorEmail, knownUser) {
  const allowed = CONFIG.SERVICE_ROLES[operation];
  if (!allowed) {
    throw new Error(`Operación sin roles definidos en CONFIG.SERVICE_ROLES: ${operation}`);
  }
  const label = `ejecutar ${operation}`;
  if (knownUser) return assertUserHasRole_(knownUser, allowed, label);

  const actor = getActorEmail_(actorEmail);
  if (!isValidEmail_(actor)) {
    throw new AppError('No se pudo identificar al usuario que ejecuta la operación.', 'FORBIDDEN');
  }
  return assertRole_(actor, allowed, label);
}

/**
 * IDs de curso (todos los alias legacy/sugerido) asignados a un docente, como conjunto { id: true }.
 * Lee Asignaciones UNA vez (usar en lotes en lugar de isTeacherAssignedToLevel_ por alumno).
 * @param {Object} user Fila de Usuarios.
 * @returns {Object<string,boolean>}
 */
function getAssignedCourseIds_(user) {
  const set = {};
  getSheetRowsAsObjects_(CONFIG.SHEETS.ASSIGNMENTS).forEach(a => {
    if (String(a.id_usuario) !== String(user.id_usuario)) return;
    getCourseIdAliases_(a.id_nivel).forEach(id => { set[id] = true; });
  });
  return set;
}

/**
 * Indica si un docente tiene asignado el curso (considera IDs equivalentes legacy/sugerido).
 * @param {Object} user Fila de Usuarios.
 * @param {string} levelId ID del curso (cualquier alias).
 * @returns {boolean}
 */
function isTeacherAssignedToLevel_(user, levelId) {
  const assigned = getAssignedCourseIds_(user);
  return getCourseIdAliases_(levelId).some(id => assigned[id] === true);
}

// ── Bloqueo único por ejecución ──────────────────────────────────────────────

// Profundidad de bloqueo de ESTA ejecución (las variables globales no se comparten entre ejecuciones).
let SCRIPT_LOCK_DEPTH_ = 0;

/**
 * Ejecuta fn dentro del bloqueo del script. Si el llamador ya lo tiene tomado, fn se ejecuta dentro
 * de ese mismo bloqueo SIN volver a adquirirlo ni liberarlo: nunca hay adquisición anidada ni una
 * liberación prematura del bloqueo exterior. El bloqueo siempre se libera al terminar (éxito o error).
 * Regla: solo los puntos de entrada públicos llaman a withScriptLock_; las funciones internas (sufijo
 * _ que reciben un contexto) no tocan LockService.
 *
 * @param {function():*} fn
 * @param {number} [timeoutMs=15000]
 * @returns {*} Lo que retorne fn.
 */
function withScriptLock_(fn, timeoutMs) {
  if (SCRIPT_LOCK_DEPTH_ > 0) {
    return fn();
  }
  const lock = LockService.getScriptLock();
  lock.waitLock(timeoutMs || 15000);
  SCRIPT_LOCK_DEPTH_++;
  try {
    return fn();
  } finally {
    SCRIPT_LOCK_DEPTH_--;
    lock.releaseLock();
  }
}

