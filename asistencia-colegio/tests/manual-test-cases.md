# 🧪 Suite de Pruebas Manuales e Integración: `Asistencia Colegio`

Escenarios de integración de extremo a extremo. El detalle por módulo está en [`docs/TEST_PLAN.md`](../docs/TEST_PLAN.md) y los datos en [`test-data.md`](test-data.md).

> Ejecutar sobre una **copia** de la planilla o con datos de `seedTestData()`. Calendario de referencia (octubre 2026): lunes `05`, jueves `08`, viernes `09`, sábado `10`, domingo `11`.

---

## 📋 Matriz de Escenarios de Prueba

| ID | Escenario | Módulo Evaluado | Resultado Esperado |
| :--- | :--- | :--- | :--- |
| **TC-01** | Validar estructura completa | `ValidationService.gs` | Alerta de éxito sin modificar datos (10 pestañas). |
| **TC-02** | Detección de pestaña o columna faltante | `ValidationService.gs` | Alerta con el nombre exacto de la pestaña o columna ausente. |
| **TC-03** | Registro individual de asistencia | `AttendanceService.gs` | Inserta fila en `Asistencias` con UUID y la `jornada` del curso; registra evento en `Auditoria`. |
| **TC-04** | Prevención de duplicado y actualización | `AttendanceService.gs` | Detecta registro previo del alumno y fecha y actualiza sin duplicar. |
| **TC-05** | Asistencia masiva por curso | `AttendanceService.gs` | Registra la lista en un lote con resumen de creados, actualizados y errores. |
| **TC-06** | Ingreso de justificativo con adjunto | `JustificationService.gs` | Crea carpeta en Drive, guarda el archivo y registra el justificativo en `Pendiente`. |
| **TC-07** | Aprobación de justificativo y sincronización | `JustificationService.gs` | Cambia a `Aprobado` y marca `Justificado` los días lunes–viernes del rango. |
| **TC-08** | Alumnos en riesgo (< 85%) | `ReportService.gs` | Calcula el porcentaje y detecta alumnos bajo el umbral. |
| **TC-09** | Exportación de reporte a Sheets | `ReportService.gs` | Genera `Reporte_Asistencia` y resalta en rojo claro (`#FADBD8`) a los alumnos en riesgo. |
| **TC-10** | Disparador diario | `Triggers.gs` | `runDailyAttendanceDigest()` audita cursos con y sin asistencia hoy (omite fines de semana). |
| **TC-11** | Trazabilidad de ediciones manuales | `Triggers.gs` | Editar una celda de `Asistencias` gatilla `onEdit(e)` y registra el cambio. |
| **TC-12** | Preparar estructura no destructivo | `SchemaService.gs` | Crea pestañas/columnas faltantes, sin duplicar ni borrar datos. |
| **TC-13** | Cambio de jornada de un curso | `CourseService.gs` | Cambia la jornada, audita y no altera el historial. |
| **TC-14** | Rechazo de fin de semana | `ScheduleService.gs` | Sábado/domingo se rechazan con `INVALID_DAY`. |
| **TC-15** | Hora fuera de la jornada | `CourseService.gs` | Se rechaza con `OUT_OF_SCHEDULE` indicando la ventana válida. |
| **TC-16** | Resumen semanal e idempotencia | `SummaryService.gs` | Crea la fila en `Resumenes`; la segunda ejecución no duplica. |
| **TC-17** | Webhook: registrar asistencia | `Webhook.gs` | `success` con token válido; escribe `Asistencias` y `Auditoria`. |
| **TC-18** | Webhook: seguridad | `Webhook.gs` | Token inválido → `UNAUTHORIZED`; rol sin permiso → `FORBIDDEN`. |
| **TC-19** | Webhook: justificativo siempre Pendiente | `Webhook.gs` | Aunque se envíe `Aprobado`, se crea `Pendiente`. |

---

## 🔍 Detalle de Escenarios de Integración Clave

### TC-07: Aprobación de Justificativo y Sincronización Automática
1. **Precondición**: alumno `E-1002` (curso `CUR-1A`, jornada Mañana) con estado `Ausente` el lunes `2026-10-05` y el martes `2026-10-06` en `Asistencias`.
2. **Pasos**:
   - Registrar un justificativo médico para `E-1002` del `2026-10-05` al `2026-10-06`.
   - Ejecutar `updateJustificationStatus(idJustificativo, "Aprobado", "Licencia médica verificada")`.
3. **Resultado esperado**:
   - `estado_aprobacion = "Aprobado"`.
   - Las filas de asistencia del 05 y 06 de octubre quedan `Justificado`.
   - Hay una entrada de auditoría `APROBAR_JUSTIFICATIVO`.
4. **Variante fin de semana**: justificativo del viernes `2026-10-09` al lunes `2026-10-12` → solo se marcan el viernes y el lunes; el sábado y el domingo no generan registros.

### TC-09: Generación de Reporte Formateado
1. **Pasos**:
   - Menú **Asistencia > Generar reporte de curso**.
   - Ingresar un ID de curso válido (`CUR-1A`; también se acepta el ID antiguo `N-101`).
2. **Resultado esperado**:
   - Aparece la pestaña `Reporte_Asistencia`.
   - Los alumnos con asistencia < 85,0% tienen fondo `#FADBD8`.
   - Se muestra un diálogo con el promedio general del curso.

### TC-13: Cambio de jornada sin afectar el historial
1. **Precondición**: `CUR-1A` en jornada `Mañana` con una asistencia ya registrada.
2. **Pasos**:
   1. **Asistencia > Cambiar jornada de un curso** → `CUR-1A` → `Tarde`.
   2. Registrar una nueva asistencia de un alumno de `CUR-1A` con `hora = 15:00`.
   3. Intentar registrar otra con `hora = 09:30`.
3. **Resultado esperado**:
   - Paso 1: `Niveles.jornada = Tarde` y auditoría `CAMBIAR_JORNADA_CURSO`.
   - Paso 2: se registra con `jornada = Tarde`.
   - Paso 3: `OUT_OF_SCHEDULE` (el curso ahora es de Tarde, desde las 14:30).
   - El registro anterior conserva `jornada = Mañana`.
4. **Limpieza**: volver a dejar `CUR-1A` en `Mañana`.

### TC-15: Límites de horario
Para `CUR-1A` (Mañana):

| Fecha | Hora | Resultado |
| :--- | :--- | :--- |
| Lunes `2026-10-05` | `08:59` | ❌ fuera de horario |
| Lunes `2026-10-05` | `09:00` | ✅ |
| Lunes `2026-10-05` | `13:00` | ✅ |
| Lunes `2026-10-05` | `13:01` | ❌ |
| Viernes `2026-10-09` | `12:10` | ✅ (fin del bloque 4) |
| Viernes `2026-10-09` | `12:11` | ❌ (el receso final no amplía la ventana) |

### TC-17 / TC-18 / TC-19: Webhook
1. **Precondición**: `generateWebhookToken()` ejecutado; Web App desplegada (o usar `testWebhookLocally()`).
2. **Pasos** (con el JSON de [`test-data.md`](test-data.md) §5):
   - TC-17: `ASISTENCIA_REGISTRAR` de `E-1001` como `docente.perez@cepatagonia.cl` → `success`.
   - TC-18a: mismo cuerpo con un token alterado → `error` / `UNAUTHORIZED`.
   - TC-18b: `CURSO_CAMBIAR_JORNADA` con el usuario Docente → `FORBIDDEN`.
   - TC-19: `JUSTIFICATIVO_SOLICITAR` como `inspectora.gomez@cepatagonia.cl` incluyendo `"estado_aprobacion": "Aprobado"` → se crea `Pendiente`.
3. **Resultado esperado**: las respuestas indicadas y un evento en `Auditoria` por cada acción (`WEBHOOK_RECHAZADO` en TC-18a).
