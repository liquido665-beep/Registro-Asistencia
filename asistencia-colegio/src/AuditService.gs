/**
 * AuditService.gs - Servicio central de registro de eventos y auditoría
 *
 * HOJA UTILIZADA
 *   CONFIG.SHEETS.AUDIT ("Auditoria"), columnas:
 *   id_evento | timestamp | usuario | accion | tabla_afectada | id_registro | detalle
 *   Se escribe por NOMBRE de encabezado (appendRowData_), no por posición.
 *
 * API
 *   writeAudit_(action, tableName, recordId, detail, actorOverride) -> boolean
 *     action        Acción del catálogo CONFIG.AUDIT_ACTIONS (otras se aceptan pero se advierte en Logger).
 *     tableName     Hoja o módulo afectado (ej: "Asistencias", "Niveles", "Sistema").
 *     recordId      ID del registro afectado (o clave del lote/resumen).
 *     detail        String u objeto (se serializa a JSON y se trunca a CONFIG.AUDIT.MAX_DETAIL_CHARS).
 *     actorOverride Email del actor real (ej: usuario que envió el webhook). Por defecto usuario activo.
 *   writeAuditError_(action, tableName, recordId, err, context, actorOverride) -> boolean
 *     Registra un incidente SIN stack trace ni datos sensibles (solo mensaje, código y contexto).
 *   getActorEmail_(override) -> string   Resolución única del actor ("SISTEMA" si no se conoce).
 *
 * EVENTOS QUE REGISTRA EL SISTEMA (CONFIG.AUDIT_ACTIONS)
 *   Asistencia:   CREAR_ASISTENCIA, EDITAR_ASISTENCIA, REGISTRO_MASIVO_ASISTENCIA
 *   Justificativos: CREAR_JUSTIFICATIVO, APROBAR_JUSTIFICATIVO, RECHAZAR_JUSTIFICATIVO
 *   Cursos:       CREAR_CURSO, MODIFICAR_CURSO, CAMBIAR_JORNADA_CURSO
 *   Resúmenes:    RESUMEN_DIARIO_ASISTENCIA, RESUMEN_SEMANAL_GENERADO, RESUMEN_SEMANAL_OMITIDO,
 *                 RESUMEN_SEMANAL_ERROR_ENVIO, ALERTA_SEMANAL_RIESGO, GENERAR_REPORTE_ASISTENCIA
 *   Sistema:      CONFIGURAR_DISPARADORES, ELIMINAR_DISPARADORES, ESTRUCTURA_ACTUALIZADA,
 *                 EDICION_MANUAL_HOJA, TOKEN_WEBHOOK_GENERADO, TEST
 *   Webhook:      WEBHOOK_ERROR, WEBHOOK_RECHAZADO
 *
 * GARANTÍA: la auditoría NUNCA interrumpe la operación de negocio (no lanza excepciones);
 * si falla, lo deja en Logger y retorna false.
 */

/**
 * Resuelve el email del actor de forma centralizada.
 * @param {string} [override] Email explícito (ej: webhook).
 * @returns {string} Email o 'SISTEMA'.
 */
function getActorEmail_(override) {
  if (override) return String(override).trim();
  try {
    return Session.getActiveUser().getEmail() || 'SISTEMA';
  } catch (e) {
    return 'SISTEMA';
  }
}

/**
 * Convierte el detalle a texto acotado para la celda.
 * @param {*} detail String u objeto.
 * @returns {string}
 */
function serializeAuditDetail_(detail) {
  let text;
  if (detail === undefined || detail === null) {
    text = '';
  } else if (typeof detail === 'string') {
    text = detail;
  } else {
    try {
      text = JSON.stringify(detail);
    } catch (e) {
      text = String(detail);
    }
  }
  const max = CONFIG.AUDIT.MAX_DETAIL_CHARS;
  if (text.length > max) {
    text = text.substring(0, max) + '…[truncado]';
  }
  return text;
}

/**
 * Escribe un registro de auditoría en la hoja Auditoria.
 * @param {string} action Acción ejecutada (ver CONFIG.AUDIT_ACTIONS).
 * @param {string} tableName Tabla/módulo afectado.
 * @param {string} recordId ID del registro afectado.
 * @param {*} detail Descripción o contexto técnico (string u objeto).
 * @param {string} [actorOverride] Email del actor real.
 * @returns {boolean} True si se escribió.
 */
function writeAudit_(action, tableName, recordId, detail, actorOverride) {
  try {
    if (Object.values(CONFIG.AUDIT_ACTIONS).indexOf(action) === -1) {
      Logger.log(`[AUDITORIA] Acción fuera de catálogo: "${action}". Agréguela a CONFIG.AUDIT_ACTIONS.`);
    }

    appendRowData_(CONFIG.SHEETS.AUDIT, {
      id_evento: Utilities.getUuid(),
      timestamp: new Date(),
      usuario: getActorEmail_(actorOverride),
      accion: action,
      tabla_afectada: tableName,
      id_registro: recordId,
      detalle: serializeAuditDetail_(detail)
    });
    return true;
  } catch (e) {
    Logger.log(`Fallo al registrar evento de auditoría (${action}): ${e.message}`);
    return false;
  }
}

/**
 * Escribe varios eventos de auditoría con UNA sola escritura (un evento por entrada).
 * Igual que writeAudit_: nunca lanza excepciones; si falla, lo deja en Logger y retorna false.
 * @param {Array<{action:string, tableName:string, recordId:string, detail:*, actor:string}>} entries
 * @returns {boolean} True si se escribieron todos.
 */
function writeAuditBatch_(entries) {
  if (!entries || entries.length === 0) return true;
  try {
    const now = new Date();
    appendRowsData_(CONFIG.SHEETS.AUDIT, entries.map(en => ({
      id_evento: Utilities.getUuid(),
      timestamp: now,
      usuario: getActorEmail_(en.actor),
      accion: en.action,
      tabla_afectada: en.tableName,
      id_registro: en.recordId,
      detalle: serializeAuditDetail_(en.detail)
    })));
    return true;
  } catch (e) {
    Logger.log(`Fallo al registrar lote de auditoría (${entries.length} eventos): ${e.message}`);
    return false;
  }
}

/**
 * Registra un incidente/error sin exponer stack trace ni datos sensibles.
 * @param {string} action Acción del catálogo (ej: WEBHOOK_ERROR).
 * @param {string} tableName Tabla/módulo.
 * @param {string} recordId ID relacionado.
 * @param {Error} err Error capturado.
 * @param {Object} [context] Contexto adicional seguro (evento, curso, etc.).
 * @param {string} [actorOverride] Email del actor.
 * @returns {boolean}
 */
function writeAuditError_(action, tableName, recordId, err, context, actorOverride) {
  return writeAudit_(
    action,
    tableName,
    recordId,
    {
      error: err && err.message ? String(err.message) : String(err),
      codigo: err && err.code ? err.code : 'ERROR_INTERNO',
      contexto: context || {}
    },
    actorOverride
  );
}

/**
 * Función de prueba para verificar el correcto registro en la bitácora de auditoría.
 */
function testAudit() {
  const ok = writeAudit_(
    CONFIG.AUDIT_ACTIONS.TEST,
    'Sistema',
    'TEST-001',
    'Prueba de conectividad y registro de auditoría ejecutada desde el menú contextual.'
  );

  if (ok) {
    showAlert_('✅ Evento de prueba registrado en la hoja "Auditoria".');
  } else {
    showAlert_('❌ No se pudo escribir en la hoja "Auditoria". Revise que exista (Asistencia > Preparar estructura) y los registros de ejecución.');
  }
}
