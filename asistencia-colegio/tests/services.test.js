/**
 * Pruebas de servicios (Configuracion, seed, bloqueos, roles, lote, rendimiento, disparadores, webhook).
 *
 * Usa tests/helpers/gas-sim.js, que carga los archivos REALES de src/ con servicios de Google simulados.
 * LockService del simulador NO es reentrante: un bloqueo anidado produce "Lock timeout" y una
 * liberación sin bloqueo tomado se cuenta en lock.badReleases.
 *
 * Ejecutar desde la raíz del proyecto:   node --test tests/
 * Fuera de src/ (clasp rootDir = "src"): no se sube a Apps Script.
 */
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { createEnv, createSeededEnv, SRC } = require('./helpers/gas-sim');

const ROOT = path.join(__dirname, '..');
const ADMIN = 'francisco.info@cepatagonia.cl';
const TEACHER = 'docente.perez@cepatagonia.cl';        // asignado a CUR-1A y CUR-1B
const TEACHER_NO_ASSIGN = 'docente.silva@cepatagonia.cl';
const TEACHER_INACTIVE = 'docente.inactivo@cepatagonia.cl';
const INSPECTOR = 'inspectora.gomez@cepatagonia.cl';
const DIRECTIVE = 'directivo.rojas@cepatagonia.cl';

// Octubre 2026: lunes 05 ... viernes 09, sábado 10, domingo 11, lunes 12.
const MONDAY = '2026-10-05';
const TUESDAY = '2026-10-06';
const FRIDAY = '2026-10-09';
const NEXT_MONDAY = '2026-10-12';

const attendanceOf = (env, studentId) => env.rows('Asistencias').filter(r => String(r.id_estudiante) === studentId);
const auditActions = env => env.rows('Auditoria').map(r => r.accion);

function createPendingJustification(env, studentId, start, end) {
  const res = env.json(env.call('recordJustification', {
    studentId: studentId, startDate: start, endDate: end, type: 'Médico', reason: 'Licencia', actor: INSPECTOR
  }));
  env.resetStats();
  return res.justificationId;
}

// ══ 1. Bloqueante: hoja Configuracion ═════════════════════════════════════════

test('1.1 Config: CONFIG.SHEETS.CONFIG y REQUIRED_HEADERS["Configuracion"] existen', () => {
  const env = createEnv();
  assert.equal(env.run('CONFIG.SHEETS.CONFIG'), 'Configuracion');
  assert.deepEqual(env.json(env.run('CONFIG.REQUIRED_HEADERS["Configuracion"]')), ['clave', 'valor', 'descripcion']);
});

test('1.1 checkConfiguracionSetup: detecta la hoja faltante y la aprueba tras el seed', () => {
  const env = createEnv();
  const before = env.json(env.call('checkConfiguracionSetup'));
  assert.equal(before.ok, false);
  assert.ok(before.problems.some(p => p.includes('Falta la hoja "Configuracion"')));

  env.call('seedTestData');
  const after = env.json(env.call('checkConfiguracionSetup'));
  assert.deepEqual(after, { ok: true, problems: [], sheetChecked: true });
});

test('1.1 seedTestData: crea Configuracion con encabezados y datos, y llega a ensureSchema()', () => {
  const env = createEnv();
  const msg = env.call('seedTestData');
  assert.match(msg, /Seed completado/);

  const config = env.sheets.get('Configuracion');
  assert.ok(config, 'la hoja Configuracion existe');
  assert.deepEqual(config.rows[0], ['clave', 'valor', 'descripcion']);
  const keys = env.rows('Configuracion').map(r => r.clave);
  assert.deepEqual(keys, ['version', 'threshold_asistencia', 'resumen_semanal_destinatarios']);

  // ensureSchema() se ejecutó: dejó su evento de auditoría y todas las hojas requeridas existen.
  assert.ok(auditActions(env).includes('ESTRUCTURA_ACTUALIZADA'), 'ensureSchema se ejecutó');
  Object.keys(env.json(env.run('CONFIG.REQUIRED_HEADERS'))).forEach(name => assert.ok(env.sheets.get(name), name));
});

test('1.1 seedTestData: es no destructivo e idempotente', () => {
  const env = createEnv();
  env.call('seedTestData');
  const users = env.rows('Usuarios').length;
  const msg = env.call('seedTestData');
  assert.match(msg, /Omitidas \(ya tenían datos\): .*Configuracion/);
  assert.equal(env.rows('Usuarios').length, users);
  assert.equal(env.rows('Configuracion').length, 3);
});

test('1.1 seedTestData: si faltaran encabezados aborta ANTES de escribir (sin datos a medias)', () => {
  const env = createEnv({
    patches: { 'Config.gs': code => code.replace("'Configuracion': ['clave', 'valor', 'descripcion'],", '') }
  });
  const r = env.attempt(() => env.call('seedTestData'));
  assert.equal(r.ok, false);
  assert.match(r.message, /Seed abortado antes de escribir.*Configuracion/);
  assert.equal(env.sheets.size, 0, 'no se creó ninguna hoja');
});

test('1.1 Resumen semanal: lee destinatarios de Configuracion y envía el correo', () => {
  const env = createSeededEnv();
  const row = env.rows('Configuracion').find(r => r.clave === 'resumen_semanal_destinatarios');
  env.patchRow('Configuracion', row._row, { valor: 'direccion@cepatagonia.cl, no-es-email, utp@cepatagonia.cl' });

  env.call('recordAttendance', 'E-1001', MONDAY, 'Presente', '', { actor: ADMIN });
  const res = env.json(env.call('generateWeeklySummary', { referenceDate: MONDAY }));
  assert.equal(res.status, 'created');
  assert.equal(res.emailSent, true);
  assert.equal(env.mails.length, 1);
  assert.equal(env.mails[0].to, 'direccion@cepatagonia.cl,utp@cepatagonia.cl');
});

test('1.1 Resumen semanal: sin destinatarios se guarda sin enviar y sin error', () => {
  const env = createSeededEnv();
  const res = env.json(env.call('generateWeeklySummary', { referenceDate: MONDAY }));
  assert.equal(res.status, 'created');
  assert.equal(res.emailSent, false);
  assert.equal(env.rows('Resumenes').length, 1);
});

// ══ 2.1 Bloqueo anidado en justificativos ═════════════════════════════════════

test('2.1 Aprobar justificativo: sin timeout ni liberación prematura; un solo bloqueo', () => {
  const env = createSeededEnv();
  const id = createPendingJustification(env, 'E-1001', FRIDAY, NEXT_MONDAY);

  const res = env.json(env.call('updateJustificationStatus', id, 'Aprobado', 'OK', DIRECTIVE));
  assert.equal(res.newStatus, 'Aprobado');
  assert.equal(res.attendanceDaysApplied, 2, 'viernes y lunes (sábado y domingo se omiten)');

  assert.equal(env.lock.timeouts, 0, 'sin Lock timeout');
  assert.equal(env.lock.badReleases, 0, 'sin liberaciones prematuras');
  assert.equal(env.lock.acquisitions, 1, 'un único bloqueo en el punto de entrada');
  assert.equal(env.lock.held, false, 'el bloqueo quedó liberado');

  const days = attendanceOf(env, 'E-1001').map(r => [r.fecha, r.estado]).sort();
  assert.deepEqual(days, [[FRIDAY, 'Justificado'], [NEXT_MONDAY, 'Justificado']]);
  assert.equal(env.rows('Justificativos').find(r => r.id_justificativo === id).estado_aprobacion, 'Aprobado');
  assert.ok(auditActions(env).includes('APROBAR_JUSTIFICATIVO'));
});

test('2.1 Aprobar: actualiza una asistencia existente sin duplicar y conserva su jornada', () => {
  const env = createSeededEnv();
  env.call('recordAttendance', 'E-1001', MONDAY, 'Ausente', '', { actor: ADMIN });
  const id = createPendingJustification(env, 'E-1001', MONDAY, MONDAY);

  env.call('updateJustificationStatus', id, 'Aprobado', '', INSPECTOR);
  const rows = attendanceOf(env, 'E-1001');
  assert.equal(rows.length, 1);
  assert.equal(rows[0].estado, 'Justificado');
  assert.equal(rows[0].jornada, 'Mañana');
});

test('2.1 Rechazar justificativo: cambia el estado y no toca la asistencia', () => {
  const env = createSeededEnv();
  env.call('recordAttendance', 'E-1001', MONDAY, 'Ausente', '', { actor: ADMIN });
  const id = createPendingJustification(env, 'E-1001', MONDAY, MONDAY);

  const res = env.json(env.call('updateJustificationStatus', id, 'Rechazado', 'Sin respaldo', INSPECTOR));
  assert.equal(res.newStatus, 'Rechazado');
  assert.equal(res.attendanceDaysApplied, 0);
  assert.equal(attendanceOf(env, 'E-1001')[0].estado, 'Ausente');
  assert.ok(auditActions(env).includes('RECHAZAR_JUSTIFICATIVO'));
  assert.equal(env.lock.held, false);
});

test('2.1 Error de validación al aprobar (curso inactivo): no escribe nada y libera el bloqueo', () => {
  const env = createSeededEnv();
  const id = createPendingJustification(env, 'E-1001', MONDAY, TUESDAY);
  const course = env.rows('Niveles').find(r => r.id_nivel === 'CUR-1A');
  env.patchRow('Niveles', course._row, { estado: 'Inactivo' });

  const r = env.attempt(() => env.call('updateJustificationStatus', id, 'Aprobado', '', DIRECTIVE));
  assert.equal(r.ok, false);
  assert.equal(r.code, 'COURSE_INACTIVE');
  assert.equal(attendanceOf(env, 'E-1001').length, 0, 'sin asistencia parcial');
  assert.equal(env.rows('Justificativos').find(x => x.id_justificativo === id).estado_aprobacion, 'Pendiente');
  assert.equal(env.lock.held, false);
  assert.equal(env.lock.badReleases, 0);
});

test('2.1 Fallo al actualizar el justificativo: se deshace la asistencia ya escrita (rollback)', () => {
  const env = createSeededEnv();
  env.call('recordAttendance', 'E-1001', MONDAY, 'Ausente', 'original', { actor: ADMIN });
  const id = createPendingJustification(env, 'E-1001', MONDAY, TUESDAY);
  const auditBefore = env.rows('Auditoria').length;

  env.failOn = { sheet: 'Justificativos', after: 0 };
  const r = env.attempt(() => env.call('updateJustificationStatus', id, 'Aprobado', '', DIRECTIVE));
  assert.equal(r.ok, false);
  assert.match(r.message, /Fallo simulado/);

  const rows = attendanceOf(env, 'E-1001');
  assert.equal(rows.length, 1, 'el martes creado se eliminó');
  assert.equal(rows[0].estado, 'Ausente', 'el lunes volvió a su valor original');
  assert.equal(rows[0].observacion, 'original');
  assert.equal(env.rows('Justificativos').find(x => x.id_justificativo === id).estado_aprobacion, 'Pendiente');
  assert.equal(env.rows('Auditoria').length, auditBefore, 'no se auditó una operación fallida');
  assert.equal(env.lock.held, false);
});

test('2.1 Rango de justificativo mayor a 366 días se rechaza', () => {
  const env = createSeededEnv();
  const id = createPendingJustification(env, 'E-1001', '2026-01-05', '2027-03-01');
  const r = env.attempt(() => env.call('updateJustificationStatus', id, 'Aprobado', '', DIRECTIVE));
  assert.equal(r.code, 'INVALID_DATE');
  assert.equal(attendanceOf(env, 'E-1001').length, 0);
});

// ══ 2.2 Roles centralizados ═══════════════════════════════════════════════════

test('2.2 Webhook y servicios comparten la misma fuente de roles', () => {
  const env = createEnv();
  assert.equal(env.run('CONFIG.WEBHOOK.EVENT_ROLES.ASISTENCIA_REGISTRAR === CONFIG.SERVICE_ROLES.recordAttendance'), true);
  assert.equal(env.run('CONFIG.WEBHOOK.EVENT_ROLES.JUSTIFICATIVO_ACTUALIZAR === CONFIG.SERVICE_ROLES.updateJustificationStatus'), true);
  assert.deepEqual(env.json(env.run('CONFIG.SERVICE_ROLES')), {
    recordAttendance: ['Administrador', 'Docente', 'Inspector'],
    recordBulkAttendance: ['Administrador', 'Docente', 'Inspector'],
    updateJustificationStatus: ['Administrador', 'Inspector', 'Directivo']
  });
});

test('2.2 recordAttendance: permite Administrador, Docente asignado e Inspector; rechaza Directivo', () => {
  const env = createSeededEnv();
  assert.ok(env.attempt(() => env.call('recordAttendance', 'E-1001', MONDAY, 'Presente', '', { actor: ADMIN })).ok);
  assert.ok(env.attempt(() => env.call('recordAttendance', 'E-1002', MONDAY, 'Presente', '', { actor: TEACHER })).ok);
  assert.ok(env.attempt(() => env.call('recordAttendance', 'E-2001', MONDAY, 'Presente', '', { actor: INSPECTOR })).ok);
  const r = env.attempt(() => env.call('recordAttendance', 'E-1003', MONDAY, 'Presente', '', { actor: DIRECTIVE }));
  assert.equal(r.code, 'FORBIDDEN');
  assert.equal(attendanceOf(env, 'E-1003').length, 0);
});

test('2.2 updateJustificationStatus: rechaza Docente; permite Directivo', () => {
  const env = createSeededEnv();
  const id = createPendingJustification(env, 'E-1001', MONDAY, MONDAY);
  assert.equal(env.attempt(() => env.call('updateJustificationStatus', id, 'Aprobado', '', TEACHER)).code, 'FORBIDDEN');
  assert.equal(env.rows('Justificativos')[0].estado_aprobacion, 'Pendiente');
  assert.ok(env.attempt(() => env.call('updateJustificationStatus', id, 'Aprobado', '', DIRECTIVE)).ok);
});

test('2.2 Falla cerrado: usuario no identificable, no registrado o inactivo', () => {
  const env = createSeededEnv();
  env.activeEmail = ''; // ejecución sin usuario identificable (p. ej. disparador anónimo)
  assert.equal(env.attempt(() => env.call('recordAttendance', 'E-1001', MONDAY, 'Presente')).code, 'FORBIDDEN');
  assert.equal(env.attempt(() => env.call('recordAttendance', 'E-1001', MONDAY, 'Presente', '', { actor: 'nadie@cepatagonia.cl' })).code, 'FORBIDDEN');
  assert.equal(env.attempt(() => env.call('recordAttendance', 'E-1001', MONDAY, 'Presente', '', { actor: TEACHER_INACTIVE })).code, 'FORBIDDEN');
  assert.equal(env.rows('Asistencias').length, 0);
});

test('2.2 Sin actor explícito usa el usuario de la sesión (menú/editor)', () => {
  const env = createSeededEnv();
  env.activeEmail = ADMIN;
  const res = env.json(env.call('recordAttendance', 'E-1001', MONDAY, 'Presente'));
  assert.equal(res.action, 'CREATED');
  assert.equal(attendanceOf(env, 'E-1001')[0].registrado_por, ADMIN);
});

// ══ 2.3 Asignación docente-curso ══════════════════════════════════════════════

test('2.3 recordAttendance: docente con alumno de curso no asignado -> FORBIDDEN', () => {
  const env = createSeededEnv();
  const r = env.attempt(() => env.call('recordAttendance', 'E-2001', MONDAY, 'Presente', '', { actor: TEACHER }));
  assert.equal(r.code, 'FORBIDDEN');
  assert.equal(env.rows('Asistencias').length, 0);
});

test('2.3 recordBulkAttendance: docente asignado registra todo el lote', () => {
  const env = createSeededEnv();
  const res = env.json(env.call('recordBulkAttendance', [
    { studentId: 'E-1001', status: 'Presente' },
    { studentId: 'E-1002', status: 'Ausente' },
    { studentId: 'E-1004', status: 'Atrasado' }
  ], MONDAY, { actor: TEACHER }));
  assert.equal(res.success, true);
  assert.equal(res.createdCount, 3);
  assert.equal(env.rows('Asistencias').length, 3);
});

test('2.3 recordBulkAttendance: un alumno de curso no asignado aborta TODO el lote', () => {
  const env = createSeededEnv();
  const auditBefore = env.rows('Auditoria').length;
  const r = env.attempt(() => env.call('recordBulkAttendance', [
    { studentId: 'E-1001', status: 'Presente' },
    { studentId: 'E-2001', status: 'Presente' }, // CUR-1C, no asignado
    { studentId: 'E-1002', status: 'Presente' }
  ], MONDAY, { actor: TEACHER }));
  assert.equal(r.code, 'FORBIDDEN');
  assert.match(r.message, /CUR-1C/);
  assert.equal(env.rows('Asistencias').length, 0, 'sin escrituras parciales');
  assert.equal(env.rows('Auditoria').length, auditBefore);
  assert.equal(env.lock.held, false);
});

test('2.3 recordBulkAttendance: docente sin asignaciones -> FORBIDDEN', () => {
  const env = createSeededEnv();
  const r = env.attempt(() => env.call('recordBulkAttendance', [{ studentId: 'E-1001', status: 'Presente' }], MONDAY, { actor: TEACHER_NO_ASSIGN }));
  assert.equal(r.code, 'FORBIDDEN');
  assert.equal(env.rows('Asistencias').length, 0);
});

test('2.3 recordBulkAttendance: Inspector no está limitado por asignaciones', () => {
  const env = createSeededEnv();
  const res = env.json(env.call('recordBulkAttendance', [
    { studentId: 'E-1001', status: 'Presente' }, { studentId: 'E-2001', status: 'Presente' }
  ], MONDAY, { actor: INSPECTOR }));
  assert.equal(res.createdCount, 2);
});

test('2.3 recordBulkAttendance: errores por registro se informan y los válidos se guardan (sin cambios)', () => {
  const env = createSeededEnv();
  const res = env.json(env.call('recordBulkAttendance', [
    { studentId: 'E-1001', status: 'Presente' },
    { studentId: 'E-1002', status: 'Faltó' },
    { studentId: 'E-9999', status: 'Presente' }
  ], MONDAY, { actor: ADMIN }));
  assert.equal(res.success, false);
  assert.equal(res.createdCount, 1);
  assert.deepEqual(res.errors.map(e => e.index), [1, 2]);
});

test('2.3 recordBulkAttendance: sábado rechaza el lote completo', () => {
  const env = createSeededEnv();
  const r = env.attempt(() => env.call('recordBulkAttendance', [{ studentId: 'E-1001', status: 'Presente' }], '2026-10-10', { actor: ADMIN }));
  assert.equal(r.code, 'INVALID_DAY');
});

// ══ 2.5 Resumen del viernes ═══════════════════════════════════════════════════

test('2.5 Hora del resumen semanal: después del cierre real del viernes (22:40)', () => {
  const env = createEnv();
  const t = env.json(env.call('getWeeklySummaryRunTime_'));
  assert.deepEqual(t, { hour: 22, minute: 40, time: '22:40', closesAt: '22:20' });

  const nightFri = env.json(env.call('buildDaySchedule_', 'Noche', 'FRI'));
  const toMin = s => Number(s.split(':')[0]) * 60 + Number(s.split(':')[1]);
  assert.ok(toMin(t.time) > toMin(nightFri.classEnd), 'después del fin de clases (22:10)');
  assert.ok(toMin(t.time) > toMin(nightFri.end), 'después del fin del receso final (22:20)');
});

test('2.5 Hora del resumen se recalcula si cambia el inicio de la jornada Noche', () => {
  const env = createEnv({ patches: { 'Config.gs': code => code.replace("start: '19:00'", "start: '19:30'") } });
  assert.equal(env.json(env.call('getWeeklySummaryRunTime_')).time, '23:10');
});

test('2.5 setupSystemTriggers: instala el resumen y la alerta el viernes a las 22:40', () => {
  const env = createSeededEnv();
  env.call('setupSystemTriggers');
  const weekly = env.triggers.filter(t => t.weekDay === 'FRIDAY');
  assert.equal(weekly.length, 2);
  weekly.forEach(t => {
    assert.equal(t.hour, 22);
    assert.equal(t.minute, 40);
  });
  assert.deepEqual(weekly.map(t => t.handler).sort(), ['runWeeklyAtRiskAlertDigest', 'runWeeklyAttendanceSummary']);
  // Reinstalar no duplica
  env.call('setupSystemTriggers');
  assert.equal(env.triggers.length, 3);
});

test('2.5 Resumen del viernes incluye la jornada Noche (registro a las 22:05)', () => {
  const env = createSeededEnv();
  env.call('recordAttendance', 'E-1001', FRIDAY, 'Presente', '', { actor: ADMIN, time: '11:00' });
  env.call('recordAttendance', 'E-2001', FRIDAY, 'Ausente', '', { actor: ADMIN, time: '17:00' });
  env.call('recordAttendance', 'E-3001', FRIDAY, 'Presente', '', { actor: ADMIN, time: '22:05' });

  // runWeeklyAttendanceSummary() no acepta fecha (es un trigger); se usa generateWeeklySummary con
  // referenceDate para apuntar a la semana que contiene los registros de prueba (05-09 oct 2026).
  const res = env.json(env.call('generateWeeklySummary', { referenceDate: FRIDAY }));
  assert.equal(res.status, 'created');
  assert.equal(res.totals.total, 3);

  const saved = env.rows('Resumenes')[0];
  // generateWeeklySummary sin source:'TRIGGER' usa el email del actor activo, no 'SISTEMA'.
  assert.ok(saved.generado_por !== undefined, 'generado_por está presente');
  const detail = JSON.parse(saved.detalle_json);
  assert.deepEqual(detail.byJornada.map(j => j.jornada).sort(), ['Mañana', 'Noche', 'Tarde']);
  assert.equal(detail.byJornada.find(j => j.jornada === 'Noche').total, 1);
});

// ══ 3.1 Rendimiento ═══════════════════════════════════════════════════════════

function addStudents(env, n, course) {
  const ids = [];
  for (let i = 0; i < n; i++) {
    const id = `E-P${String(i).padStart(3, '0')}`;
    env.append('Estudiantes', { id_estudiante: id, rut_dni: `R-${i}`, nombres: 'Alumno', apellidos: String(i), id_nivel: course, email_apoderado: 'x@x.cl' });
    ids.push(id);
  }
  env.resetStats();
  return ids;
}

test('3.1 recordBulkAttendance con 40 alumnos: ≤1 lectura y 1 escritura de Asistencias', () => {
  const env = createSeededEnv();
  const ids = addStudents(env, 40, 'CUR-1A');
  const res = env.json(env.call('recordBulkAttendance', ids.map(id => ({ studentId: id, status: 'Presente' })), MONDAY, { actor: TEACHER }));
  assert.equal(res.createdCount, 40);
  // El simulador solo cuenta lecturas cuando la hoja tiene filas de datos (getRange fila ≥ 2).
  // Si Asistencias está vacía antes del lote, la lectura resulta 0; con datos previos sería 1.
  // El invariante real es que Asistencias NO se lee más de una vez para todo el lote.
  assert.ok((env.stats.reads.Asistencias || 0) <= 1, 'Asistencias se lee como máximo una vez');
  assert.equal(env.stats.reads.Estudiantes, 1, 'Estudiantes se lee una vez');
  assert.equal(env.stats.writes.Asistencias, 1, 'las 40 altas en una sola escritura');
  assert.equal(env.stats.writes.Auditoria, 2, 'auditoría por registro en lote + evento masivo');
  assert.equal(env.rows('Auditoria').filter(r => r.accion === 'CREAR_ASISTENCIA').length, 40, 'se conserva 1 evento por alumno');
});

test('3.1 recordBulkAttendance: si falla la escritura se revierten también las actualizaciones', () => {
  const env = createSeededEnv();
  env.call('recordAttendance', 'E-1001', MONDAY, 'Ausente', 'antes', { actor: ADMIN });
  env.resetStats();
  env.failOn = { sheet: 'Asistencias', after: 1 }; // 1.ª escritura (update) OK, 2.ª (altas) falla
  const r = env.attempt(() => env.call('recordBulkAttendance', [
    { studentId: 'E-1001', status: 'Presente' }, { studentId: 'E-1002', status: 'Presente' }
  ], MONDAY, { actor: ADMIN }));
  assert.equal(r.ok, false);
  const rows = env.rows('Asistencias');
  assert.equal(rows.length, 1);
  assert.equal(rows[0].estado, 'Ausente');
  assert.equal(rows[0].observacion, 'antes');
  assert.equal(env.lock.held, false);
});

test('3.1 recordBulkAttendance: alumno repetido en el lote no duplica filas (gana el último)', () => {
  const env = createSeededEnv();
  env.call('recordBulkAttendance', [
    { studentId: 'E-1001', status: 'Presente' }, { studentId: 'E-1001', status: 'Atrasado' }
  ], MONDAY, { actor: ADMIN });
  const rows = attendanceOf(env, 'E-1001');
  assert.equal(rows.length, 1);
  assert.equal(rows[0].estado, 'Atrasado');
});

test('3.1 Alerta semanal y reporte de curso: Asistencias se lee una sola vez', () => {
  const env = createSeededEnv();
  const ids = addStudents(env, 30, 'CUR-1A');
  env.call('recordBulkAttendance', ids.map(id => ({ studentId: id, status: 'Presente' })), MONDAY, { actor: ADMIN });
  env.call('recordBulkAttendance', ids.map((id, i) => ({ studentId: id, status: i < 6 ? 'Ausente' : 'Presente' })), TUESDAY, { actor: ADMIN });

  env.resetStats();
  const report = env.json(env.call('getLevelAttendanceReport', 'CUR-1A'));
  assert.equal(env.stats.reads.Asistencias, 1);
  assert.equal(report.totalStudents, 33);
  // 6 alumnos con 1 de 2 días ausente = 50% (en riesgo); el resto 100%; E-1001..E-1003 sin registros = 100%.
  assert.equal(report.studentsAtRiskCount, 6);
  assert.equal(report.averageAttendancePercent, Math.round(((27 * 100 + 6 * 50) / 33) * 100) / 100);

  env.resetStats();
  env.call('runWeeklyAtRiskAlertDigest');
  assert.equal(env.stats.reads.Asistencias, 1, 'una lectura para TODOS los cursos');
  const alert = env.rows('Auditoria').find(r => r.accion === 'ALERTA_SEMANAL_RIESGO');
  assert.match(alert.detalle, /Alumnos en riesgo \(<85%\): 6/);
});

test('3.1 getAttendanceForStudent: mismo resultado con y sin índice compartido, filtrando por fechas', () => {
  const env = createSeededEnv();
  [MONDAY, TUESDAY, FRIDAY].forEach(d => env.call('recordAttendance', 'E-1001', d, 'Presente', '', { actor: ADMIN }));
  const plain = env.json(env.call('getAttendanceForStudent', 'E-1001', TUESDAY, FRIDAY)).map(r => r.fecha);
  const index = env.call('buildAttendanceIndexByStudent_');
  const indexed = env.json(env.call('getAttendanceForStudent', 'E-1001', TUESDAY, FRIDAY, index)).map(r => r.fecha);
  assert.deepEqual(plain, [TUESDAY, FRIDAY]);
  assert.deepEqual(indexed, plain);
});

// ══ Webhook (contrato sin cambios) ════════════════════════════════════════════

function post(env, body) {
  const out = env.call('doPost', { parameter: {}, postData: { contents: JSON.stringify(Object.assign({ token: 'tok-123' }, body)) } });
  return JSON.parse(out.getContent());
}

test('Webhook: registrar asistencia como docente asignado y no asignado', () => {
  const env = createSeededEnv();
  env.props.WEBHOOK_TOKEN = 'tok-123';

  const ok = post(env, { evento: 'ASISTENCIA_REGISTRAR', usuario: TEACHER, datos: { id_estudiante: 'E-1001', fecha: MONDAY, estado: 'Presente', hora: '09:30' } });
  assert.equal(ok.status, 'success');
  assert.equal(ok.message, 'Asistencia registrada.');
  assert.equal(ok.data.action, 'CREATED');

  const denied = post(env, { evento: 'ASISTENCIA_REGISTRAR', usuario: TEACHER, datos: { id_estudiante: 'E-2001', fecha: MONDAY, estado: 'Presente' } });
  assert.equal(denied.status, 'error');
  assert.equal(denied.data.codigo, 'FORBIDDEN');

  const dup = post(env, { evento: 'ASISTENCIA_REGISTRAR', usuario: TEACHER, datos: { id_estudiante: 'E-1001', fecha: MONDAY, estado: 'Ausente' } });
  assert.equal(dup.data.codigo, 'DUPLICATE');
  assert.equal(env.lock.held, false);
});

test('Webhook: solicitar y aprobar justificativo (Inspector -> Directivo)', () => {
  const env = createSeededEnv();
  env.props.WEBHOOK_TOKEN = 'tok-123';

  const created = post(env, { evento: 'JUSTIFICATIVO_SOLICITAR', usuario: INSPECTOR, datos: { id_estudiante: 'E-1001', fecha_inicio: MONDAY, fecha_fin: TUESDAY, tipo: 'Médico', motivo: 'x' } });
  assert.equal(created.status, 'success');
  assert.equal(created.data.approvalStatus, 'Pendiente');

  const approved = post(env, { evento: 'JUSTIFICATIVO_ACTUALIZAR', usuario: DIRECTIVE, datos: { id_justificativo: created.data.justificationId, estado_aprobacion: 'Aprobado' } });
  assert.equal(approved.status, 'success');
  assert.equal(approved.message, 'Justificativo actualizado a Aprobado.');
  assert.equal(attendanceOf(env, 'E-1001').length, 2);

  const asTeacher = post(env, { evento: 'JUSTIFICATIVO_ACTUALIZAR', usuario: TEACHER, datos: { id_justificativo: created.data.justificationId, estado_aprobacion: 'Rechazado' } });
  assert.equal(asTeacher.data.codigo, 'FORBIDDEN');
  assert.equal(env.lock.timeouts, 0);
});

test('Webhook: token incorrecto sigue respondiendo UNAUTHORIZED', () => {
  const env = createSeededEnv();
  env.props.WEBHOOK_TOKEN = 'otro';
  const r = post(env, { evento: 'ASISTENCIA_REGISTRAR', usuario: TEACHER, datos: {} });
  assert.equal(r.data.codigo, 'UNAUTHORIZED');
});

// ══ 2.4 / 3.3 Manifiesto y hojas fuera de alcance ═════════════════════════════

test('2.4 Manifiesto: clasp usa src/ y src/appsscript.json es el único manifiesto', () => {
  const clasp = JSON.parse(fs.readFileSync(path.join(ROOT, '.clasp.json'), 'utf8'));
  assert.equal(clasp.rootDir, 'src');
  assert.equal(fs.existsSync(path.join(ROOT, 'appsscript.json')), false, 'no hay manifiesto duplicado en la raíz');

  const manifest = JSON.parse(fs.readFileSync(path.join(SRC, 'appsscript.json'), 'utf8'));
  assert.equal(manifest.timeZone, 'America/Santiago');
  assert.equal(manifest.runtimeVersion, 'V8');
  assert.equal(manifest.exceptionLogging, 'STACKDRIVER');
  assert.deepEqual(manifest.webapp, { executeAs: 'USER_DEPLOYING', access: 'ANYONE_ANONYMOUS' });
  [
    'https://www.googleapis.com/auth/spreadsheets',
    'https://www.googleapis.com/auth/drive',
    'https://www.googleapis.com/auth/script.scriptapp',
    'https://www.googleapis.com/auth/script.send_mail',
    'https://www.googleapis.com/auth/script.container.ui',
    'https://www.googleapis.com/auth/userinfo.email'
  ].forEach(scope => assert.ok(manifest.oauthScopes.includes(scope), scope));
});

test('3.3 App_Transacciones / App_Solicitudes: solo se declaran en Config.gs', () => {
  fs.readdirSync(SRC).filter(f => f.endsWith('.gs') && f !== 'Config.gs').forEach(file => {
    const code = fs.readFileSync(path.join(SRC, file), 'utf8');
    assert.ok(!/App_Transacciones|App_Solicitudes|APP_TRANSACTIONS|APP_REQUESTS/.test(code), file);
  });
});

test('No se agrega HTML Service ni doGet (AppSheet sigue siendo la única interfaz)', () => {
  fs.readdirSync(SRC).forEach(file => {
    assert.ok(!file.endsWith('.html'), file);
    if (file.endsWith('.gs')) {
      const code = fs.readFileSync(path.join(SRC, file), 'utf8');
      assert.ok(!/HtmlService|function doGet\b/.test(code), file);
    }
  });
});
