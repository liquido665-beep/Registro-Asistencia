# Plan de Verificación en Google Apps Script

Este documento contiene los casos de verificación que **deben ejecutarse directamente en Google Apps Script** (o en el libro de Google Sheets vinculado), ya que el simulador local no puede reemplazar el entorno real.

> **Regla:** ningún caso se marca como ✅ Aprobado sin evidencia registrada (captura, log o texto de respuesta). Por defecto todos tienen Estado **Pendiente**.

**Convenciones:**
- Datos de prueba: `seedTestData()` ejecutado previamente.
- IDs de referencia: [`tests/test-data.md`](test-data.md).
- Fecha de prueba: usar lunes a viernes del mes en curso.

---

## GV-01: `seedTestData()` y `checkConfiguracionSetup()`

**Objetivo:** verificar que el seed carga la hoja `Configuracion` y que el check la detecta correctamente.

**Precondiciones:**
- Libro vacío (sin datos previos) o libro de prueba limpio.

**Pasos:**
1. Desde el editor de Apps Script, ejecutar `seedTestData()`.
2. Verificar en la planilla que existe la hoja `Configuracion` con 3 filas de datos: `version`, `threshold_asistencia`, `resumen_semanal_destinatarios`.
3. Ejecutar `checkConfiguracionSetup()` desde el editor.

**Resultado esperado:**
- `seedTestData()` retorna un string con `Seed completado`.
- `checkConfiguracionSetup()` retorna `{ ok: true, problems: [], sheetChecked: true }`.
- La hoja `Auditoria` contiene `ESTRUCTURA_ACTUALIZADA`.

**Estado:** Pendiente
**Evidencia a registrar:** captura de la consola con el retorno de ambas funciones + vista de la hoja `Configuracion`.

---

## GV-02: `ensureSchema()` / `prepareStructure()`

**Objetivo:** verificar que la preparación de estructura es no destructiva y crea pestañas y columnas faltantes.

**Precondiciones:**
- Libro con datos de prueba. Eliminar la pestaña `Resumenes`.

**Pasos:**
1. **Asistencia → Preparar estructura (no destructivo)**.
2. Verificar que `Resumenes` fue recreada con encabezados en negrita.
3. Ejecutar por segunda vez.

**Resultado esperado:**
- Primera vez: diálogo indica `Pestañas creadas: Resumenes`. El resto de las hojas sin cambios.
- Segunda vez: diálogo indica `ninguna` creada; sin duplicados.

**Estado:** Pendiente
**Evidencia a registrar:** capturas del diálogo en ambas ejecuciones.

---

## GV-03: Webhook — registro de asistencia individual

**Objetivo:** verificar el contrato completo del webhook para `ASISTENCIA_REGISTRAR`.

**Precondiciones:**
- Web App desplegada. Token generado (`generateWebhookToken()`). Datos de seed cargados.

**Pasos:**
```bash
# Caso correcto — Docente asignado a CUR-1A
curl -L -X POST "<URL_EXEC>" -H "Content-Type: application/json" -d '{
  "token": "<WEBHOOK_TOKEN>",
  "evento": "ASISTENCIA_REGISTRAR",
  "usuario": "docente.perez@cepatagonia.cl",
  "datos": { "id_estudiante": "E-1001", "fecha": "<LUNES>", "estado": "Presente", "hora": "09:30" }
}'

# Caso FORBIDDEN — Docente con alumno de curso no asignado
curl -L -X POST "<URL_EXEC>" -H "Content-Type: application/json" -d '{
  "token": "<WEBHOOK_TOKEN>",
  "evento": "ASISTENCIA_REGISTRAR",
  "usuario": "docente.perez@cepatagonia.cl",
  "datos": { "id_estudiante": "E-2001", "fecha": "<LUNES>", "estado": "Presente" }
}'

# Duplicado — mismo alumno y fecha
curl -L -X POST "<URL_EXEC>" -H "Content-Type: application/json" -d '{
  "token": "<WEBHOOK_TOKEN>",
  "evento": "ASISTENCIA_REGISTRAR",
  "usuario": "docente.perez@cepatagonia.cl",
  "datos": { "id_estudiante": "E-1001", "fecha": "<LUNES>", "estado": "Ausente" }
}'
```

**Resultado esperado:**
- Caso 1: `{ "status": "success", "data": { "action": "CREATED" } }`.
- Caso 2: `{ "status": "error", "data": { "codigo": "FORBIDDEN" } }`. Sin fila en `Asistencias`.
- Caso 3: `{ "status": "error", "data": { "codigo": "DUPLICATE" } }`.

**Estado:** Pendiente
**Evidencia a registrar:** respuestas JSON de los tres `curl` + fila en `Asistencias` + fila en `Auditoria`.

---

## GV-04: Asistencia individual — Docente asignado y no asignado

**Objetivo:** verificar el comportamiento desde el menú / editor (sin webhook).

**Precondiciones:** datos de seed. `env.activeEmail` = email del docente (en GAS, el usuario activo de la sesión).

**Pasos:**
1. Desde el editor, ejecutar:
   ```javascript
   recordAttendance('E-1001', '2026-10-05', 'Presente', '', { actor: 'docente.perez@cepatagonia.cl' });
   ```
2. Ejecutar con alumno de curso no asignado:
   ```javascript
   recordAttendance('E-2001', '2026-10-05', 'Presente', '', { actor: 'docente.perez@cepatagonia.cl' });
   ```

**Resultado esperado:**
- Paso 1: retorna `{ action: 'CREATED', ... }`. Fila en `Asistencias`.
- Paso 2: lanza `AppError` con `code: 'FORBIDDEN'`. Sin fila en `Asistencias`.

**Estado:** Pendiente
**Evidencia a registrar:** output de la consola + vista de `Asistencias`.

---

## GV-05: Asistencia masiva — lote con alumno de curso no asignado (aborta todo)

**Objetivo:** verificar que un alumno de curso no asignado aborta el lote completo sin escrituras parciales.

**Precondiciones:** datos de seed.

**Pasos:**
```javascript
recordBulkAttendance([
  { studentId: 'E-1001', status: 'Presente' },
  { studentId: 'E-2001', status: 'Presente' },  // CUR-1C, no asignado
  { studentId: 'E-1002', status: 'Presente' }
], '2026-10-05', { actor: 'docente.perez@cepatagonia.cl' });
```

**Resultado esperado:**
- Lanza `AppError` con `code: 'FORBIDDEN'` y mensaje que menciona `CUR-1C`.
- `Asistencias` permanece vacía (cero filas de datos).
- `Auditoria` sin nuevas entradas de asistencia.

**Estado:** Pendiente
**Evidencia a registrar:** output de la consola + vistas de `Asistencias` y `Auditoria`.

---

## GV-06: Webhook — aprobar justificativo (Directivo)

**Objetivo:** verificar flujo completo Inspector → Directivo con sincronización de asistencias.

**Precondiciones:** datos de seed. Registro previo de asistencia `E-1001` en el lunes como `Ausente`.

**Pasos:**
1. Crear justificativo (Inspector):
   ```bash
   curl -L -X POST "<URL_EXEC>" -H "Content-Type: application/json" -d '{
     "token": "<WEBHOOK_TOKEN>",
     "evento": "JUSTIFICATIVO_SOLICITAR",
     "usuario": "inspectora.gomez@cepatagonia.cl",
     "datos": { "id_estudiante": "E-1001", "fecha_inicio": "<LUNES>", "fecha_fin": "<MARTES>", "tipo": "Médico", "motivo": "Licencia" }
   }'
   ```
2. Copiar `justificationId` de la respuesta.
3. Aprobar (Directivo):
   ```bash
   curl -L -X POST "<URL_EXEC>" -H "Content-Type: application/json" -d '{
     "token": "<WEBHOOK_TOKEN>",
     "evento": "JUSTIFICATIVO_ACTUALIZAR",
     "usuario": "directivo.rojas@cepatagonia.cl",
     "datos": { "id_justificativo": "<ID>", "estado_aprobacion": "Aprobado" }
   }'
   ```
4. Intentar aprobar como Docente (debe ser rechazado):
   ```bash
   curl -L -X POST "<URL_EXEC>" -H "Content-Type: application/json" -d '{
     "token": "<WEBHOOK_TOKEN>",
     "evento": "JUSTIFICATIVO_ACTUALIZAR",
     "usuario": "docente.perez@cepatagonia.cl",
     "datos": { "id_justificativo": "<ID>", "estado_aprobacion": "Rechazado" }
   }'
   ```

**Resultado esperado:**
- Paso 1: `{ "status": "success", "data": { "approvalStatus": "Pendiente" } }`.
- Paso 3: `{ "status": "success", "message": "Justificativo actualizado a Aprobado." }`. `Asistencias` tiene 2 filas (`Justificado`): lunes y martes. Sin duplicados.
- Paso 4: `{ "status": "error", "data": { "codigo": "FORBIDDEN" } }`.

**Estado:** Pendiente
**Evidencia a registrar:** respuestas JSON + vista de `Asistencias` + vista de `Justificativos` + `Auditoria` con `APROBAR_JUSTIFICATIVO`.

---

## GV-07: Liberación del lock — aprobación y error

**Objetivo:** verificar que el lock se libera correctamente en caso de éxito y de error.

**Precondiciones:** datos de seed.

**Pasos:**
1. Aprobar un justificativo exitosamente (ver GV-06).
2. En el log de Apps Script (Ver → Registros de ejecución) verificar que no aparece `Lock timeout`.
3. Forzar un error: en la hoja `Justificativos`, proteger la celda `estado_aprobacion` del justificativo pendiente. Intentar aprobarlo desde el webhook.

**Resultado esperado:**
- Paso 1: log sin `Lock timeout`. El bloqueo se tomó y liberó una sola vez.
- Paso 3: la respuesta indica error, el justificativo sigue en `Pendiente`, `Asistencias` no cambió.

**Estado:** Pendiente
**Evidencia a registrar:** log de ejecución (sin `Lock timeout`) + vista de `Justificativos`.

---

## GV-08: Resumen semanal del viernes — jornada Noche incluida

**Objetivo:** verificar que el trigger del viernes después de las 22:40 incluye registros de la jornada Noche.

**Precondiciones:**
- Datos de seed. Registrar asistencias del viernes: una de Mañana (09:30), una de Tarde (17:00) y una de Noche (22:05).
- Los 3 registros deben ser del mismo viernes.

**Pasos:**
1. Registrar los 3 registros con actor y hora:
   ```javascript
   recordAttendance('E-1001', '<VIERNES>', 'Presente', '', { actor: 'inspectora.gomez@cepatagonia.cl', time: '11:00' });
   recordAttendance('E-2001', '<VIERNES>', 'Ausente',  '', { actor: 'inspectora.gomez@cepatagonia.cl', time: '17:00' });
   recordAttendance('E-3001', '<VIERNES>', 'Presente', '', { actor: 'inspectora.gomez@cepatagonia.cl', time: '22:05' });
   ```
2. Ejecutar manualmente el trigger del viernes (después de las 22:40 o usando `referenceDate`):
   ```javascript
   generateWeeklySummary({ referenceDate: '<VIERNES>' });
   ```
3. Verificar la hoja `Resumenes`.

**Resultado esperado:**
- Una fila en `Resumenes` con `total_registros = 3`.
- `detalle_json` contiene `byJornada` con `Mañana`, `Tarde` y `Noche`; el total de Noche es 1.

**Estado:** Pendiente
**Evidencia a registrar:** fila en `Resumenes` + contenido JSON del campo `detalle_json`.

---

## GV-09: Rendimiento con 40+ alumnos

**Objetivo:** verificar que un lote de 40+ alumnos ejecuta en tiempo aceptable (<= 30 s) sin lecturas repetidas.

**Precondiciones:** datos de seed + 40 alumnos de prueba en `CUR-1A`.

**Pasos:**
1. Agregar 40 alumnos con IDs únicos en `Estudiantes` (columna `id_nivel = CUR-1A`).
2. Ejecutar desde el editor:
   ```javascript
   const ids = /* array de 40 IDs */;
   recordBulkAttendance(ids.map(id => ({ studentId: id, status: 'Presente' })), '<LUNES>', { actor: 'francisco.info@cepatagonia.cl' });
   ```
3. Revisar el log de ejecución (tiempo total) en **Ver → Registros de ejecución**.

**Resultado esperado:**
- Tiempo de ejecución <= 30 segundos.
- 40 filas en `Asistencias`.
- 2 filas en `Auditoria`: una por cada alumno (CREAR_ASISTENCIA) + 1 REGISTRO_MASIVO_ASISTENCIA (escritura por lote).

**Estado:** Pendiente
**Evidencia a registrar:** tiempo de ejecución del log + conteo de filas en `Asistencias` y `Auditoria`.
