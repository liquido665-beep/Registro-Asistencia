/**
 * JustificationService.gs - Lógica de negocio para gestión de justificativos y archivos en Google Drive
 * 
 * Funcionalidades:
 * - Registro de justificativos médicos, personales o legales.
 * - Subida y organización automática de archivos adjuntos (PDFs, imágenes) en Google Drive.
 * - Flujo de aprobación/rechazo de justificativos por directivos o inspectores.
 * - Actualización automática de registros de asistencia a 'Justificado' al aprobar.
 * - Registro de auditoría para cada acción sobre justificativos.
 *
 * BLOQUEOS Y ATOMICIDAD
 * - recordJustification y updateJustificationStatus toman UN solo bloqueo (withScriptLock_) en su
 *   punto de entrada y todo lo que hacen dentro es interno y NO adquiere bloqueos: ya no existe la
 *   cadena updateJustificationStatus -> recordAttendance -> waitLock que anidaba el mismo bloqueo.
 * - Flujo al aprobar: (1) bajo el bloqueo se relee el justificativo, (2) se valida y planifica la
 *   asistencia de todos los días lun-vie en memoria, (3) se escribe la asistencia en lote, (4) se
 *   actualiza el estado del justificativo; si el paso 4 falla se deshace el paso 3. La auditoría se
 *   escribe solo cuando todo salió bien. Un error de validación (p. ej. curso inactivo) se lanza
 *   ANTES de escribir nada.
 */

/**
 * Obtiene o crea la carpeta principal de almacenamiento en Google Drive estructurada por año.
 * @param {string} year Año académico (ej: '2026').
 * @returns {GoogleAppsScript.Drive.Folder} Referencia a la carpeta de destino en Drive.
 */
function getOrCreateJustificationsFolder_(year) {
  const rootFolderName = CONFIG.DRIVE ? CONFIG.DRIVE.FOLDER_NAME : 'Justificativos_Escolares';
  const targetYear = year || String(new Date().getFullYear());

  // Buscar carpeta raíz
  const rootFolders = DriveApp.getFoldersByName(rootFolderName);
  let rootFolder;
  if (rootFolders.hasNext()) {
    rootFolder = rootFolders.next();
  } else {
    rootFolder = DriveApp.createFolder(rootFolderName);
  }

  // Buscar o crear subcarpeta por año
  const yearFolders = rootFolder.getFoldersByName(targetYear);
  if (yearFolders.hasNext()) {
    return yearFolders.next();
  } else {
    return rootFolder.createFolder(targetYear);
  }
}

/**
 * Guarda un archivo adjunto en Google Drive y retorna su URL pública/institucional.
 * 
 * @param {GoogleAppsScript.Base.Blob} fileBlob Blob del archivo adjunto.
 * @param {string} studentId ID del estudiante.
 * @param {string} dateStartStr Fecha de inicio del justificativo.
 * @returns {string} URL directa del archivo guardado en Google Drive.
 */
function uploadJustificationFile_(fileBlob, studentId, dateStartStr) {
  if (!fileBlob) return '';

  const year = dateStartStr.substring(0, 4);
  const targetFolder = getOrCreateJustificationsFolder_(year);
  
  const originalName = fileBlob.getName() || 'adjunto.pdf';
  const sanitizedStudentId = String(studentId).replace(/[^a-zA-Z0-9_-]/g, '');
  const newFileName = `Justificativo_${sanitizedStudentId}_${dateStartStr}_${originalName}`;

  fileBlob.setName(newFileName);
  const file = targetFolder.createFile(fileBlob);

  return file.getUrl();
}

/**
 * Validar si el tipo de justificativo está soportado en la configuración.
 * @param {string} type Tipo a evaluar.
 * @returns {boolean} True si es válido.
 */
function isValidJustificationType_(type) {
  const validTypes = Object.values(CONFIG.JUSTIFICATION_TYPES);
  return validTypes.includes(type);
}

/**
 * Registra un nuevo justificativo en el sistema.
 * 
 * @param {Object} payload Datos del justificativo.
 * @param {string} payload.studentId ID del estudiante.
 * @param {Date|string} payload.startDate Fecha inicio inasistencia.
 * @param {Date|string} payload.endDate Fecha fin inasistencia.
 * @param {string} payload.type Tipo ('Médico', 'Personal', 'Gendarmería', 'Otros').
 * @param {string} payload.reason Descripción del motivo.
 * @param {GoogleAppsScript.Base.Blob} [payload.fileBlob] Archivo adjunto (opcional).
 * @param {string} [payload.approvalStatus='Pendiente'] Estado inicial ('Pendiente', 'Aprobado').
 * @param {string} [payload.actor] Email de quien registra (webhook); por defecto el usuario activo.
 * @returns {Object} Registro del justificativo creado.
 */
function recordJustification(payload) {
  const studentId = payload.studentId;
  const startDateStr = formatDateISO_(payload.startDate);
  const endDateStr = formatDateISO_(payload.endDate);
  const type = payload.type;
  const reason = payload.reason || '';
  const initialStatus = payload.approvalStatus || CONFIG.APPROVAL_STATUS.PENDING;

  if (!studentId) throw new AppError('El ID del estudiante es obligatorio.');
  if (startDateStr > endDateStr) throw new AppError('La fecha de inicio no puede ser posterior a la fecha de término.');
  if (!isValidJustificationType_(type)) {
    throw new AppError(`Tipo de justificativo inválido: "${type}". Válidos: ${Object.values(CONFIG.JUSTIFICATION_TYPES).join(', ')}.`);
  }

  // Verificar existencia de estudiante
  const students = getSheetRowsAsObjects_(CONFIG.SHEETS.STUDENTS);
  const studentExists = students.some(s => String(s.id_estudiante) === String(studentId));
  if (!studentExists) throw new AppError(`Estudiante con ID "${studentId}" no encontrado.`);

  // Subir archivo a Drive si se proporciona (fuera del bloqueo: es lento y no toca las hojas)
  let driveUrl = '';
  if (payload.fileBlob) {
    try {
      driveUrl = uploadJustificationFile_(payload.fileBlob, studentId, startDateStr);
    } catch (e) {
      Logger.log(`Error al subir archivo a Drive: ${e.message}`);
    }
  }

  const newId = Utilities.getUuid();
  const currentUser = getActorEmail_(payload.actor);
  const timestampStr = new Date().toISOString();

  const record = {
    id_justificativo: newId,
    id_estudiante: studentId,
    fecha_inicio: startDateStr,
    fecha_fin: endDateStr,
    tipo: type,
    motivo: String(reason).trim(),
    url_archivo_drive: driveUrl,
    estado_aprobacion: initialStatus,
    registrado_por: currentUser,
    timestamp: timestampStr
  };

  // Sección crítica ÚNICA: asistencia (si nace Aprobado) + alta del justificativo + auditoría.
  withScriptLock_(() => {
    // Si se crea como Aprobado directamente, sincronizar asistencia (valida y escribe en lote;
    // si falla lanza antes de crear el justificativo).
    let applied = null;
    if (initialStatus === CONFIG.APPROVAL_STATUS.APPROVED) {
      applied = applyJustificationToAttendance_(studentId, startDateStr, endDateStr, `Justificativo ${type}: ${reason}`, currentUser);
    }

    try {
      appendRowData_(CONFIG.SHEETS.JUSTIFICATIONS, record);
    } catch (e) {
      if (applied) applied.rollback();
      throw e;
    }

    // Registro de auditoría
    writeAudit_(
      CONFIG.AUDIT_ACTIONS.CREAR_JUSTIFICATIVO,
      CONFIG.SHEETS.JUSTIFICATIONS,
      newId,
      `Justificativo ${type} creado para alumno ${studentId} (${startDateStr} a ${endDateStr}) - Estado: ${initialStatus}`,
      currentUser
    );
    if (applied) applied.audit();
  });

  return {
    success: true,
    justificationId: newId,
    studentId: studentId,
    startDate: startDateStr,
    endDate: endDateStr,
    type: type,
    driveUrl: driveUrl,
    approvalStatus: initialStatus
  };
}

/**
 * Actualiza el estado de aprobación de un justificativo (Aprobado / Rechazado).
 *
 * ROLES: Administrador, Inspector, Directivo (CONFIG.SERVICE_ROLES.updateJustificationStatus).
 * Al aprobar se marca 'Justificado' cada día lun-vie del rango (ver cabecera: bloqueos y atomicidad).
 * Rechazar (o volver a Pendiente) NO modifica la asistencia ya registrada.
 * 
 * @param {string} justificationId ID del justificativo.
 * @param {string} newStatus Estado deseado ('Aprobado' o 'Rechazado').
 * @param {string} [comment=''] Comentario u observación de la revisión.
 * @param {string} [actorEmail] Email de quien revisa (webhook); por defecto el usuario activo.
 * @param {Object} [knownUser] Fila de Usuarios ya validada por el llamador (webhook), evita releer la hoja.
 * @returns {Object} Resultado de la actualización.
 */
function updateJustificationStatus(justificationId, newStatus, comment, actorEmail, knownUser) {
  requireServiceRole_('updateJustificationStatus', actorEmail, knownUser);

  if (!justificationId) throw new AppError('El ID de justificativo es requerido.');
  
  const validStatuses = Object.values(CONFIG.APPROVAL_STATUS);
  if (!validStatuses.includes(newStatus)) {
    throw new AppError(`Estado de aprobación inválido: "${newStatus}". Permitidos: ${validStatuses.join(', ')}.`);
  }

  const currentUser = getActorEmail_(actorEmail);

  // Sección crítica ÚNICA: releer, aplicar asistencia, actualizar estado y auditar.
  return withScriptLock_(() => {
    const rows = getSheetRowsAsObjects_(CONFIG.SHEETS.JUSTIFICATIONS);
    const targetRecord = rows.find(r => String(r.id_justificativo) === String(justificationId));

    if (!targetRecord) {
      throw new AppError(`Justificativo con ID "${justificationId}" no fue encontrado.`);
    }

    // Si se aprueba, marcar asistencia de los días correspondientes como 'Justificado'
    // (todo se valida antes de escribir; los errores se lanzan sin dejar datos parciales).
    let applied = null;
    if (newStatus === CONFIG.APPROVAL_STATUS.APPROVED) {
      applied = applyJustificationToAttendance_(
        targetRecord.id_estudiante,
        formatDateISO_(targetRecord.fecha_inicio),
        formatDateISO_(targetRecord.fecha_fin),
        `Justificativo Aprobado (${targetRecord.tipo}): ${targetRecord.motivo || ''}`,
        currentUser
      );
    }

    try {
      updateRowData_(CONFIG.SHEETS.JUSTIFICATIONS, targetRecord._rowIndex, {
        estado_aprobacion: newStatus,
        timestamp: new Date().toISOString()
      });
    } catch (e) {
      if (applied) applied.rollback();
      throw e;
    }

    // Auditoría (solo cuando todo salió bien)
    writeAudit_(
      newStatus === CONFIG.APPROVAL_STATUS.APPROVED ? CONFIG.AUDIT_ACTIONS.APROBAR_JUSTIFICATIVO : CONFIG.AUDIT_ACTIONS.RECHAZAR_JUSTIFICATIVO,
      CONFIG.SHEETS.JUSTIFICATIONS,
      justificationId,
      `Justificativo ${justificationId} actualizado a ${newStatus} por ${currentUser}. Comentario: ${comment || 'N/A'}`,
      currentUser
    );
    if (applied) applied.audit();

    return {
      success: true,
      justificationId: justificationId,
      newStatus: newStatus,
      studentId: targetRecord.id_estudiante,
      attendanceDaysApplied: applied ? applied.created + applied.updated : 0
    };
  });
}

/**
 * Marca como 'Justificado' el rango de días en Asistencias. FUNCIÓN INTERNA: debe llamarse con el
 * bloqueo del script ya tomado (withScriptLock_) y NO adquiere ni libera bloqueos.
 * Solo se marcan días de lunes a viernes; sábados y domingos se omiten.
 *
 * Valida y planifica TODOS los días en memoria antes de escribir; si algún día no es válido (alumno o
 * curso inexistente, curso inactivo, jornada inválida) lanza AppError sin haber escrito nada. La
 * escritura es en lote y se deshace sola si falla.
 *
 * @param {string} studentId ID del alumno.
 * @param {string} startDateStr Fecha inicio (YYYY-MM-DD).
 * @param {string} endDateStr Fecha fin (YYYY-MM-DD).
 * @param {string} note Observación a colocar.
 * @param {string} [actorEmail] Email del actor que aprueba.
 * @returns {{created:number, updated:number, days:Array<string>, rollback:function():void, audit:function():void}}
 *   rollback deshace la escritura de asistencia (si falla un paso posterior del llamador); audit escribe
 *   la auditoría de asistencia y debe llamarse solo cuando toda la operación terminó bien.
 */
function applyJustificationToAttendance_(studentId, startDateStr, endDateStr, note, actorEmail) {
  const start = parseISODate_(startDateStr);
  const end = parseISODate_(endDateStr);
  if (!start || !end) {
    throw new AppError('Las fechas del justificativo no son válidas.', 'INVALID_DATE');
  }
  if ((end.getTime() - start.getTime()) / 86400000 > 366) {
    throw new AppError('El rango del justificativo no puede superar 366 días.', 'INVALID_DATE');
  }

  const days = listWeekdaysBetween_(startDateStr, endDateStr);
  const actor = getActorEmail_(actorEmail);
  const ctx = loadAttendanceContext_();

  days.forEach(day => {
    // Sin 'user': es una operación interna del flujo de aprobación (ya autorizado por el llamador);
    // el aprobador puede ser Directivo, que no toma asistencia.
    planAttendanceRecord_(
      ctx,
      { studentId: studentId, status: CONFIG.ATTENDANCE_STATUS.JUSTIFIED, observation: note },
      day,
      { actor: actorEmail },
      null
    );
  });

  const committed = commitAttendanceOps_(ctx.ops);
  const ops = ctx.ops;
  return {
    created: committed.created,
    updated: committed.updated,
    days: days,
    rollback: committed.rollback,
    audit: () => auditAttendanceOps_(ops, actor)
  };
}

/**
 * Obtiene todos los justificativos asociados a un alumno.
 * @param {string} studentId ID del alumno.
 * @returns {Array<Object>} Lista de justificativos.
 */
function getJustificationsForStudent(studentId) {
  if (!studentId) throw new AppError('El ID de estudiante es requerido.');
  const allRows = getSheetRowsAsObjects_(CONFIG.SHEETS.JUSTIFICATIONS);
  return allRows.filter(r => String(r.id_estudiante) === String(studentId));
}

/**
 * Obtiene la lista de justificativos en estado 'Pendiente' para revisión por inspectores/directivos.
 * @returns {Array<Object>} Lista de justificativos pendientes.
 */
function getPendingJustifications() {
  const allRows = getSheetRowsAsObjects_(CONFIG.SHEETS.JUSTIFICATIONS);
  return allRows.filter(r => String(r.estado_aprobacion) === CONFIG.APPROVAL_STATUS.PENDING);
}
