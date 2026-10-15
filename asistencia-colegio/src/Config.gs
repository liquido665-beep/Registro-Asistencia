/**
 * Config.gs - Configuración Global del Sistema de Asistencia Escolar
 * Contiene la definición estricta de pestañas obligatorias, encabezados mínimos,
 * jornadas y horarios (ÚNICA fuente de verdad), catálogo de cursos y parámetros
 * de webhook, resúmenes y disparadores.
 * No realiza modificaciones ni contiene datos reales.
 */

// Roles autorizados por operación de servicio (ÚNICA fuente de verdad). Los usa requireServiceRole_
// (AccessService.gs) y el webhook (CONFIG.WEBHOOK.EVENT_ROLES) para que ambas capas coincidan.
const SERVICE_ROLES_ = Object.freeze({
  recordAttendance: Object.freeze(['Administrador', 'Docente', 'Inspector']),
  recordBulkAttendance: Object.freeze(['Administrador', 'Docente', 'Inspector']),
  updateJustificationStatus: Object.freeze(['Administrador', 'Inspector', 'Directivo'])
});

const CONFIG = Object.freeze({
  SHEETS: {
    USERS: 'Usuarios',
    LEVELS: 'Niveles',
    STUDENTS: 'Estudiantes',
    ASSIGNMENTS: 'Asignaciones',
    ATTENDANCE: 'Asistencias',
    JUSTIFICATIONS: 'Justificativos',
    AUDIT: 'Auditoria',
    SUMMARIES: 'Resumenes',
    CONFIG: 'Configuracion',
    APP_TRANSACTIONS: 'App_Transacciones',
    APP_REQUESTS: 'App_Solicitudes'
  },

  // Encabezados mínimos requeridos por cada pestaña para garantizar la integridad estructural.
  // Las columnas nuevas (jornada, estado, fechas de curso, Resumenes) se agregan con
  // "Asistencia > Preparar estructura" (ensureSchema), que es no destructivo.
  REQUIRED_HEADERS: Object.freeze({
    'Usuarios': ['id_usuario', 'email', 'nombre_completo', 'rol', 'estado'],
    'Niveles': ['id_nivel', 'nombre_nivel', 'grado', 'seccion', 'jornada', 'estado', 'fecha_creacion', 'fecha_modificacion'],
    'Estudiantes': ['id_estudiante', 'rut_dni', 'nombres', 'apellidos', 'id_nivel', 'email_apoderado'],
    'Asignaciones': ['id_asignacion', 'id_usuario', 'id_nivel', 'asignatura', 'periodo_academico'],
    'Asistencias': ['id_asistencia', 'id_estudiante', 'fecha', 'estado', 'observacion', 'registrado_por', 'timestamp', 'jornada'],
    'Justificativos': ['id_justificativo', 'id_estudiante', 'fecha_inicio', 'fecha_fin', 'tipo', 'motivo', 'url_archivo_drive', 'estado_aprobacion', 'registrado_por', 'timestamp'],
    'Auditoria': ['id_evento', 'timestamp', 'usuario', 'accion', 'tabla_afectada', 'id_registro', 'detalle'],
    'Resumenes': ['id_resumen', 'clave', 'semana_inicio', 'semana_fin', 'alcance', 'generado_por', 'timestamp', 'total_registros', 'porcentaje_asistencia', 'alumnos_con_ausencias', 'destinatarios', 'detalle_json'],
    'Configuracion': ['clave', 'valor', 'descripcion'],
    'App_Transacciones': ['id_trx', 'evento', 'id_estudiante', 'fecha', 'estado', 'observacion', 'hora', 'jornada'],
    'App_Solicitudes': ['id_req', 'id_estudiante', 'fecha_inicio', 'fecha_fin', 'tipo', 'motivo', 'url_archivo_drive']
  }),

  // Estados permitidos para asistencia
  ATTENDANCE_STATUS: Object.freeze({
    PRESENT: 'Presente',
    ABSENT: 'Ausente',
    LATE: 'Atrasado',
    JUSTIFIED: 'Justificado'
  }),

  // Roles de usuario del sistema
  ROLES: Object.freeze({
    ADMIN: 'Administrador',
    TEACHER: 'Docente',
    DIRECTIVE: 'Directivo',
    INSPECTOR: 'Inspector'
  }),

  // Roles permitidos por operación de servicio (ver SERVICE_ROLES_ arriba y requireServiceRole_).
  SERVICE_ROLES: SERVICE_ROLES_,

  // Tipos de justificativo reconocidos
  JUSTIFICATION_TYPES: Object.freeze({
    MEDICAL: 'Médico',
    PERSONAL: 'Personal',
    LEGAL: 'Gendarmería',
    OTHER: 'Otros'
  }),

  // Estados de aprobación de justificativos
  APPROVAL_STATUS: Object.freeze({
    PENDING: 'Pendiente',
    APPROVED: 'Aprobado',
    REJECTED: 'Rechazado'
  }),

  // Configuración de Google Drive para almacenamiento de documentos
  DRIVE: Object.freeze({
    FOLDER_NAME: 'Justificativos_Escolares'
  }),

  // ── Jornadas y horarios (ÚNICA fuente de verdad) ──────────────────────────
  JORNADAS: Object.freeze({
    MORNING: 'Mañana',
    AFTERNOON: 'Tarde',
    NIGHT: 'Noche'
  }),

  // Hora de inicio de cada jornada (formato 24 h "HH:mm"), igual de lunes a viernes.
  // Los bloques, recesos y la hora de término se CALCULAN a partir de este inicio y de
  // DAY_PATTERNS (ver ScheduleService.gs: buildDaySchedule_). No hay horas de término fijas.
  SCHEDULES: Object.freeze({
    'Mañana': Object.freeze({ start: '09:00' }),
    'Tarde':  Object.freeze({ start: '14:30' }),
    'Noche':  Object.freeze({ start: '19:00' })
  }),

  // Estructura de la jornada por tipo de día, igual para Mañana, Tarde y Noche.
  // MON_THU = lunes a jueves, FRI = viernes. Los elementos se encadenan en orden, sin pausas
  // implícitas ni solapamientos. BLOCK = bloque de clase (se numera 1, 2, 3...); BREAK = receso.
  //  - Lunes a jueves: B1 B2 R10 B3 B4 R5 B5 (5 bloques de 45 min)
  //  - Viernes:        B1 B2 R10 B3 B4 R10   (4 bloques de 45 min, sin bloque 5)
  // La ventana de asistencia termina al finalizar el ÚLTIMO BLOQUE; un receso final (viernes)
  // se muestra en el detalle pero no amplía esa ventana.
  DAY_PATTERNS: Object.freeze({
    MON_THU: Object.freeze([
      Object.freeze({ type: 'BLOCK', minutes: 45 }),
      Object.freeze({ type: 'BLOCK', minutes: 45 }),
      Object.freeze({ type: 'BREAK', minutes: 10 }),
      Object.freeze({ type: 'BLOCK', minutes: 45 }),
      Object.freeze({ type: 'BLOCK', minutes: 45 }),
      Object.freeze({ type: 'BREAK', minutes: 5 }),
      Object.freeze({ type: 'BLOCK', minutes: 45 })
    ]),
    FRI: Object.freeze([
      Object.freeze({ type: 'BLOCK', minutes: 45 }),
      Object.freeze({ type: 'BLOCK', minutes: 45 }),
      Object.freeze({ type: 'BREAK', minutes: 10 }),
      Object.freeze({ type: 'BLOCK', minutes: 45 }),
      Object.freeze({ type: 'BLOCK', minutes: 45 }),
      Object.freeze({ type: 'BREAK', minutes: 10 })
    ])
  }),

  ATTENDANCE_RULES: Object.freeze({
    // 0=domingo ... 6=sábado. Solo lunes (1) a viernes (5).
    ALLOWED_WEEKDAYS: Object.freeze([1, 2, 3, 4, 5]),
    // Si es true, un registro con fecha de HOY sin hora explícita se valida contra la
    // hora actual del servidor. Por defecto solo se valida cuando se informa la hora.
    ENFORCE_CURRENT_TIME_WINDOW: false
  }),

  COURSE_STATUS: Object.freeze({
    ACTIVE: 'Activo',
    INACTIVE: 'Inactivo'
  }),

  // Catálogo inicial de cursos. "jornada" es un valor INICIAL de ejemplo: el administrador
  // puede cambiarlo luego con changeCourseJornada (menú Asistencia > Cambiar jornada).
  // grado = número de nivel (1, 2, 3); seccion = letra.
  COURSE_CATALOG: Object.freeze([
    { id: 'CUR-1A', nombre: '1° Nivel A', grado: 1, seccion: 'A', jornada: 'Mañana' },
    { id: 'CUR-1B', nombre: '1° Nivel B', grado: 1, seccion: 'B', jornada: 'Mañana' },
    { id: 'CUR-1C', nombre: '1° Nivel C', grado: 1, seccion: 'C', jornada: 'Tarde' },
    { id: 'CUR-1D', nombre: '1° Nivel D', grado: 1, seccion: 'D', jornada: 'Tarde' },
    { id: 'CUR-2A', nombre: '2° Nivel A', grado: 2, seccion: 'A', jornada: 'Mañana' },
    { id: 'CUR-2B', nombre: '2° Nivel B', grado: 2, seccion: 'B', jornada: 'Mañana' },
    { id: 'CUR-2C', nombre: '2° Nivel C', grado: 2, seccion: 'C', jornada: 'Tarde' },
    { id: 'CUR-2D', nombre: '2° Nivel D', grado: 2, seccion: 'D', jornada: 'Tarde' },
    { id: 'CUR-3A', nombre: '3° Nivel A', grado: 3, seccion: 'A', jornada: 'Noche' }
  ]),

  // IDs existentes (Seed/CSV originales) -> ID sugerido. Se conservan los IDs existentes en las
  // hojas; este mapa permite que cualquiera de los dos IDs resuelva al mismo curso.
  LEGACY_COURSE_ID_MAP: Object.freeze({
    'N-101': 'CUR-1A',
    'N-102': 'CUR-1B',
    'N-103': 'CUR-1C',
    'N-104': 'CUR-1D',
    'N-105': 'CUR-2A'
  }),

  // Parámetros para reportes y alertas de asistencia
  REPORTS: Object.freeze({
    CRITICAL_THRESHOLD_PERCENT: 85.0,
    REPORT_SHEET_NAME: 'Reporte_Asistencia'
  }),

  // Resumen semanal (hoja "Resumenes"). Destinatarios opcionales en Configuracion.
  SUMMARY: Object.freeze({
    RECIPIENTS_CONFIG_KEY: 'resumen_semanal_destinatarios',
    MAX_JSON_CHARS: 45000
  }),

  // Configuración de disparadores temporales (Triggers)
  TRIGGERS: Object.freeze({
    DAILY_DIGEST_HOUR: 23,        // desde el cierre de la jornada Noche (23:00 de lunes a jueves)
    WEEKLY_SUMMARY_DAY: 'FRIDAY',
    // El resumen semanal y la alerta de riesgo corren DESPUÉS del cierre real del viernes: se calcula
    // como el fin más tardío de las jornadas del viernes (hoy Noche: receso final hasta 22:20) más este
    // margen para escrituras tardías => 22:40 (Apps Script ejecuta entre 22:40 y 22:55, nearMinute(40)).
    // Ver getWeeklySummaryRunTime_() en ScheduleService.gs.
    WEEKLY_SUMMARY_MARGIN_MINUTES: 20
  }),

  // Webhook de AppSheet (doPost). El token se guarda en Propiedades del script, NUNCA en código.
  WEBHOOK: Object.freeze({
    TOKEN_PROPERTY: 'WEBHOOK_TOKEN',
    MAX_BODY_CHARS: 100000,
    MAX_OBSERVATION_CHARS: 500,
    MAX_REASON_CHARS: 1000,
    // Roles (valores de CONFIG.ROLES) autorizados por evento
    EVENT_ROLES: Object.freeze({
      ASISTENCIA_REGISTRAR: SERVICE_ROLES_.recordAttendance,
      ASISTENCIA_ACTUALIZAR: SERVICE_ROLES_.recordAttendance,
      CURSO_CAMBIAR_JORNADA: ['Administrador'],
      JUSTIFICATIVO_SOLICITAR: ['Administrador', 'Inspector'],
      JUSTIFICATIVO_ACTUALIZAR: SERVICE_ROLES_.updateJustificationStatus
    })
  }),

  AUDIT: Object.freeze({
    MAX_DETAIL_CHARS: 40000
  }),

  // Catálogo de eventos de auditoría (ver AuditService.gs)
  AUDIT_ACTIONS: Object.freeze({
    CREAR_ASISTENCIA: 'CREAR_ASISTENCIA',
    EDITAR_ASISTENCIA: 'EDITAR_ASISTENCIA',
    REGISTRO_MASIVO_ASISTENCIA: 'REGISTRO_MASIVO_ASISTENCIA',
    CREAR_JUSTIFICATIVO: 'CREAR_JUSTIFICATIVO',
    APROBAR_JUSTIFICATIVO: 'APROBAR_JUSTIFICATIVO',
    RECHAZAR_JUSTIFICATIVO: 'RECHAZAR_JUSTIFICATIVO',
    CREAR_CURSO: 'CREAR_CURSO',
    MODIFICAR_CURSO: 'MODIFICAR_CURSO',
    CAMBIAR_JORNADA_CURSO: 'CAMBIAR_JORNADA_CURSO',
    GENERAR_REPORTE_ASISTENCIA: 'GENERAR_REPORTE_ASISTENCIA',
    RESUMEN_DIARIO_ASISTENCIA: 'RESUMEN_DIARIO_ASISTENCIA',
    RESUMEN_SEMANAL_GENERADO: 'RESUMEN_SEMANAL_GENERADO',
    RESUMEN_SEMANAL_OMITIDO: 'RESUMEN_SEMANAL_OMITIDO',
    RESUMEN_SEMANAL_ERROR_ENVIO: 'RESUMEN_SEMANAL_ERROR_ENVIO',
    ALERTA_SEMANAL_RIESGO: 'ALERTA_SEMANAL_RIESGO',
    CONFIGURAR_DISPARADORES: 'CONFIGURAR_DISPARADORES',
    ELIMINAR_DISPARADORES: 'ELIMINAR_DISPARADORES',
    ESTRUCTURA_ACTUALIZADA: 'ESTRUCTURA_ACTUALIZADA',
    EDICION_MANUAL_HOJA: 'EDICION_MANUAL_HOJA',
    WEBHOOK_ERROR: 'WEBHOOK_ERROR',
    WEBHOOK_RECHAZADO: 'WEBHOOK_RECHAZADO',
    TOKEN_WEBHOOK_GENERADO: 'TOKEN_WEBHOOK_GENERADO',
    TEST: 'TEST'
  })
});
