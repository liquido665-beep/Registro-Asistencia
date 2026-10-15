/**
 * Webhook.gs - Endpoint doPost(e) para AppSheet
 *
 * CONTRATO DE ENTRADA (POST, cuerpo JSON):
 * {
 *   "token":   "<secreto en Propiedades del script WEBHOOK_TOKEN>",
 *   "evento":  "ASISTENCIA_REGISTRAR" | "ASISTENCIA_ACTUALIZAR" | "CURSO_CAMBIAR_JORNADA"
 *              | "JUSTIFICATIVO_SOLICITAR" | "JUSTIFICATIVO_ACTUALIZAR",
 *   "usuario": "email@dominio.cl",          // quien ejecuta (AppSheet USEREMAIL()), debe estar Activo en Usuarios
 *   "datos":   { ... }                      // según el evento (nombres = columnas de las hojas)
 * }
 *
 * datos por evento (fechas 'YYYY-MM-DD', horas 'HH:mm'):
 *   ASISTENCIA_REGISTRAR / ASISTENCIA_ACTUALIZAR:
 *       id_estudiante, fecha, estado, observacion (opc.), hora (opc.), jornada (opc.)
 *   CURSO_CAMBIAR_JORNADA:        id_nivel, jornada
 *   JUSTIFICATIVO_SOLICITAR:      id_estudiante, fecha_inicio, fecha_fin, tipo, motivo
 *   JUSTIFICATIVO_ACTUALIZAR:     id_justificativo, estado_aprobacion, comentario (opc.)
 *
 * RESPUESTA SIEMPRE JSON: { "status": "success"|"error", "message": "...", "data": { ... } }
 *
 * SEGURIDAD:
 *  - Falla cerrado: si WEBHOOK_TOKEN no está configurado, rechaza todo.
 *  - Los errores internos no se exponen (mensaje genérico); el detalle va a Auditoria.
 *  - Los rechazos de autenticación se auditan con límite de 1 por minuto (anti-inundación).
 *  - Apps Script no permite leer cabeceras HTTP: el token viaja en el cuerpo o en ?token=.
 */

function doPost(e) {
  let evento = 'DESCONOCIDO';
  let actor = 'WEBHOOK';

  try {
    const payload = parseWebhookBody_(e);
    evento = String(payload.evento === undefined || payload.evento === null ? '' : payload.evento).trim().toUpperCase();

    authenticateWebhook_(payload, e);

    const email = normalizeEmail_(payload.usuario);
    if (!isValidEmail_(email)) {
      throw new AppError('El campo "usuario" debe ser un email válido.', 'BAD_REQUEST');
    }
    actor = email;

    const handlers = getWebhookHandlers_();
    if (!handlers[evento]) {
      throw new AppError(`Evento no soportado: "${evento}". Soportados: ${Object.keys(handlers).join(', ')}.`, 'BAD_REQUEST');
    }

    const user = assertRole_(actor, CONFIG.WEBHOOK.EVENT_ROLES[evento], `ejecutar el evento ${evento}`);

    const datos = payload.datos;
    if (!datos || typeof datos !== 'object' || Array.isArray(datos)) {
      throw new AppError('El campo "datos" debe ser un objeto JSON.', 'BAD_REQUEST');
    }

    const outcome = handlers[evento](datos, actor, user);
    return webhookResponse_('success', outcome.message, outcome.data);
  } catch (err) {
    return handleWebhookError_(err, evento, actor);
  }
}

// ── Parseo y autenticación ───────────────────────────────────────────────────

function parseWebhookBody_(e) {
  if (!e || !e.postData || !e.postData.contents) {
    throw new AppError('Solicitud vacía: se esperaba un cuerpo JSON.', 'BAD_REQUEST');
  }
  const raw = String(e.postData.contents);
  if (raw.length > CONFIG.WEBHOOK.MAX_BODY_CHARS) {
    throw new AppError('El cuerpo de la solicitud excede el tamaño permitido.', 'BAD_REQUEST');
  }

  let payload;
  try {
    payload = JSON.parse(raw);
  } catch (parseError) {
    throw new AppError('El cuerpo no es un JSON válido.', 'BAD_REQUEST');
  }
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    throw new AppError('El cuerpo debe ser un objeto JSON.', 'BAD_REQUEST');
  }
  return payload;
}

function authenticateWebhook_(payload, e) {
  const expected = PropertiesService.getScriptProperties().getProperty(CONFIG.WEBHOOK.TOKEN_PROPERTY);
  if (!expected) {
    throw new AppError('Servicio no disponible.', 'NOT_CONFIGURED');
  }
  const provided = String(payload.token || (e && e.parameter && e.parameter.token) || '');
  if (!provided || provided !== expected) {
    throw new AppError('No autorizado.', 'UNAUTHORIZED');
  }
}

// ── Respuestas y manejo de errores ───────────────────────────────────────────

function webhookResponse_(status, message, data) {
  return ContentService
    .createTextOutput(JSON.stringify({ status: status, message: message, data: data || {} }))
    .setMimeType(ContentService.MimeType.JSON);
}

function handleWebhookError_(err, evento, actor) {
  const code = err && err.code ? err.code : 'ERROR_INTERNO';
  const clientSafe = !!(err && err.clientSafe);
  const isAuthIssue = code === 'UNAUTHORIZED' || code === 'NOT_CONFIGURED';

  try {
    if (isAuthIssue) {
      // Anti-inundación: un solo registro de rechazo por minuto
      const cache = CacheService.getScriptCache();
      if (!cache.get('webhook_reject_audit')) {
        cache.put('webhook_reject_audit', '1', 60);
        writeAuditError_(CONFIG.AUDIT_ACTIONS.WEBHOOK_RECHAZADO, 'Webhook', evento, err, { evento: evento });
      }
    } else {
      writeAuditError_(CONFIG.AUDIT_ACTIONS.WEBHOOK_ERROR, 'Webhook', evento, err, { evento: evento }, actor);
    }
  } catch (auditFailure) {
    Logger.log('No se pudo auditar el error del webhook: ' + auditFailure.message);
  }

  const message = clientSafe ? err.message : 'Error interno al procesar la solicitud.';
  return webhookResponse_('error', message, { codigo: clientSafe ? code : 'ERROR_INTERNO' });
}

// ── Validadores ──────────────────────────────────────────────────────────────

function requireText_(datos, field, maxLen) {
  const value = datos[field];
  if (value === undefined || value === null || String(value).trim() === '') {
    throw new AppError(`Falta el campo obligatorio "${field}".`, 'BAD_REQUEST');
  }
  const text = String(value).trim();
  if (maxLen && text.length > maxLen) {
    throw new AppError(`El campo "${field}" excede ${maxLen} caracteres.`, 'BAD_REQUEST');
  }
  return text;
}

function optionalText_(datos, field, maxLen) {
  const value = datos[field];
  if (value === undefined || value === null || String(value).trim() === '') return '';
  const text = String(value).trim();
  if (maxLen && text.length > maxLen) {
    throw new AppError(`El campo "${field}" excede ${maxLen} caracteres.`, 'BAD_REQUEST');
  }
  return text;
}

function requireDate_(datos, field) {
  const text = requireText_(datos, field);
  if (!parseISODate_(text)) {
    throw new AppError(`El campo "${field}" debe tener formato YYYY-MM-DD y ser una fecha real (recibido: "${text}").`, 'INVALID_DATE');
  }
  return text;
}

function optionalTime_(datos, field) {
  const text = optionalText_(datos, field);
  if (text && !isValidTimeFormat_(text)) {
    throw new AppError(`El campo "${field}" debe tener formato HH:mm (24 h).`, 'INVALID_TIME');
  }
  return text;
}

// La validación docente-curso vive ahora en AttendanceService (planAttendanceRecord_), compartida por
// el registro individual y el masivo; el webhook solo pasa el usuario ya validado.

// ── Manejadores por evento ───────────────────────────────────────────────────

function getWebhookHandlers_() {
  return {
    ASISTENCIA_REGISTRAR: (d, actor, user) => webhookAttendance_(d, actor, user, 'create'),
    ASISTENCIA_ACTUALIZAR: (d, actor, user) => webhookAttendance_(d, actor, user, 'update'),

    CURSO_CAMBIAR_JORNADA: (d, actor) => {
      const res = changeCourseJornada(requireText_(d, 'id_nivel'), requireText_(d, 'jornada'), actor);
      return {
        message: res.changed ? 'Jornada del curso actualizada.' : 'El curso ya tenía esa jornada; sin cambios.',
        data: res
      };
    },

    JUSTIFICATIVO_SOLICITAR: (d, actor) => {
      const res = recordJustification({
        studentId: requireText_(d, 'id_estudiante'),
        startDate: requireDate_(d, 'fecha_inicio'),
        endDate: requireDate_(d, 'fecha_fin'),
        type: requireText_(d, 'tipo'),
        reason: optionalText_(d, 'motivo', CONFIG.WEBHOOK.MAX_REASON_CHARS),
        urlFile: optionalText_(d, 'url_archivo_drive', 500),
        approvalStatus: CONFIG.APPROVAL_STATUS.PENDING, // el webhook nunca crea justificativos ya aprobados
        actor: actor
      });
      return { message: 'Justificativo registrado en estado Pendiente.', data: res };
    },

    JUSTIFICATIVO_ACTUALIZAR: (d, actor, user) => {
      const res = updateJustificationStatus(
        requireText_(d, 'id_justificativo'),
        requireText_(d, 'estado_aprobacion'),
        optionalText_(d, 'comentario', CONFIG.WEBHOOK.MAX_REASON_CHARS),
        actor,
        user
      );
      return { message: `Justificativo actualizado a ${res.newStatus}.`, data: res };
    }
  };
}

function webhookAttendance_(d, actor, user, mode) {
  const studentId = requireText_(d, 'id_estudiante');
  const fecha = requireDate_(d, 'fecha');
  const estado = requireText_(d, 'estado');
  const observacion = optionalText_(d, 'observacion', CONFIG.WEBHOOK.MAX_OBSERVATION_CHARS);
  const hora = optionalTime_(d, 'hora');
  const jornada = optionalText_(d, 'jornada');

  const res = recordAttendance(studentId, fecha, estado, observacion, {
    mode: mode,
    time: hora,
    jornada: jornada,
    actor: actor,
    user: user
  });

  return {
    message: res.action === 'CREATED' ? 'Asistencia registrada.' : 'Asistencia actualizada.',
    data: res
  };
}

// ── Utilidades de configuración y prueba (ejecutar desde el editor) ──────────

/**
 * Genera (o rota) el token del webhook y lo guarda en Propiedades del script.
 * Ejecutar manualmente desde el editor; el token se muestra UNA vez en el registro de ejecución.
 * Alternativa: crear la propiedad WEBHOOK_TOKEN a mano en Configuración del proyecto.
 */
function generateWebhookToken() {
  const token = Utilities.getUuid().replace(/-/g, '') + Utilities.getUuid().replace(/-/g, '');
  PropertiesService.getScriptProperties().setProperty(CONFIG.WEBHOOK.TOKEN_PROPERTY, token);
  writeAudit_(CONFIG.AUDIT_ACTIONS.TOKEN_WEBHOOK_GENERADO, 'Sistema', 'WEBHOOK', 'Token del webhook generado/rotado.');
  Logger.log('WEBHOOK_TOKEN generado (cópielo ahora, no se vuelve a mostrar): ' + token);
  return 'Token generado. Revise el registro de ejecución.';
}

/**
 * Prueba local de doPost sin HTTP. Edite "evento" y "datos" y ejecute desde el editor.
 * Requiere WEBHOOK_TOKEN configurado y que "usuario" exista en la hoja Usuarios.
 */
function testWebhookLocally() {
  const token = PropertiesService.getScriptProperties().getProperty(CONFIG.WEBHOOK.TOKEN_PROPERTY);
  const fakeEvent = {
    parameter: {},
    postData: {
      type: 'application/json',
      contents: JSON.stringify({
        token: token,
        evento: 'ASISTENCIA_REGISTRAR',
        usuario: 'francisco.info@cepatagonia.cl',
        datos: { id_estudiante: 'E-1001', fecha: '2026-10-05', estado: 'Presente', observacion: 'Prueba local', hora: '09:30' }
      })
    }
  };
  const response = doPost(fakeEvent).getContent();
  Logger.log(response);
  return response;
}
