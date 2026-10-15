# 📊 Datasets y Payloads de Prueba: `Asistencia Colegio`

Datos simulados y payloads para pruebas unitarias y de integración.

> **IDs de prueba** (los carga `seedTestData()`; `data/*.csv` usa los IDs antiguos equivalentes):
> - Estudiantes `E-1001`, `E-1002`, `E-1003` → curso `CUR-1A` (antes `N-101`), jornada **Mañana**
> - Estudiantes `E-1004`, `E-1005` → curso `CUR-1B` (antes `N-102`), jornada **Mañana**
> - Usuarios: `francisco.info@cepatagonia.cl` (Administrador), `docente.perez@cepatagonia.cl` (Docente, asignado a `CUR-1A` y `CUR-1B`), `inspectora.gomez@cepatagonia.cl` (Inspector)
> - Ambos IDs de curso (`N-101` y `CUR-1A`) se aceptan en todas las búsquedas.
>
> **Fechas** (octubre 2026): lunes `2026-10-05`, martes `06`, jueves `08`, viernes `09`, sábado `10` (inválido), domingo `11` (inválido).
>
> **Horario Mañana** (ventana de asistencia): inicio 09:00; lunes a jueves hasta 13:00 (fin del bloque 5); viernes hasta 12:10 (fin del bloque 4). Detalle de bloques y recesos en `README.md` y en `schedule.test.js`.

---

## 1. 🧑‍🎓 Datos de Alumnos (`seedTestData()`)

```json
[
  { "id_estudiante": "E-1001", "rut_dni": "23456789-1", "nombres": "Lucas",     "apellidos": "González Pérez",  "id_nivel": "CUR-1A" },
  { "id_estudiante": "E-1002", "rut_dni": "23456789-2", "nombres": "Sofía",     "apellidos": "Rodríguez Silva", "id_nivel": "CUR-1A" },
  { "id_estudiante": "E-1003", "rut_dni": "23456789-3", "nombres": "Mateo",     "apellidos": "Fernández López", "id_nivel": "CUR-1A" },
  { "id_estudiante": "E-1004", "rut_dni": "23456789-4", "nombres": "Valentina", "apellidos": "Morales Díaz",    "id_nivel": "CUR-1B" },
  { "id_estudiante": "E-1005", "rut_dni": "23456789-5", "nombres": "Benjamín",  "apellidos": "Castro Torres",   "id_nivel": "CUR-1B" }
]
```

---

## 2. 📝 Payloads para `recordAttendance()`

### 2.1 Asistencia individual
```javascript
recordAttendance("E-1001", "2026-10-05", "Presente", "Llegada a la hora");
```

### 2.2 Con hora y jornada
```javascript
recordAttendance("E-1001", "2026-10-06", "Presente", "", { time: "09:30", jornada: "Mañana" });
```

### 2.3 Modos
```javascript
recordAttendance("E-1001", "2026-10-05", "Ausente", "", { mode: "create" }); // DUPLICATE si ya existe
recordAttendance("E-1003", "2026-10-07", "Ausente", "", { mode: "update" }); // NOT_FOUND si no existe
```

### 2.4 Casos que deben fallar
```javascript
recordAttendance("E-1001", "2026-10-10", "Presente");                          // sábado -> INVALID_DAY
recordAttendance("E-1001", "2026-10-11", "Presente");                          // domingo -> INVALID_DAY
recordAttendance("E-1001", "2026-10-05", "Presente", "", { time: "08:59" });   // OUT_OF_SCHEDULE
recordAttendance("E-1001", "2026-10-09", "Presente", "", { time: "12:30" });   // viernes, OUT_OF_SCHEDULE
recordAttendance("E-1001", "2026-10-05", "Presente", "", { jornada: "Tarde" }); // JORNADA_MISMATCH
recordAttendance("E-1001", "2026-10-05", "Faltó");                             // INVALID_STATUS
recordAttendance("E-9999", "2026-10-05", "Presente");                          // NOT_FOUND
```

### 2.5 Asistencia masiva — curso `CUR-1A` (`recordBulkAttendance()`)
```javascript
recordBulkAttendance(
  [
    { studentId: "E-1001", status: "Presente", observation: "" },
    { studentId: "E-1002", status: "Ausente",  observation: "Inasistencia sin avisar" },
    { studentId: "E-1003", status: "Atrasado", observation: "Ingreso 09:15" }
  ],
  "2026-10-05"
);
```

---

## 3. 📄 Payloads para `recordJustification()`

```javascript
recordJustification({
  studentId: "E-1002",
  startDate: "2026-10-05",
  endDate: "2026-10-06",
  type: "Médico",
  reason: "Reposo médico por cuadro gripal 48 hrs.",
  approvalStatus: "Pendiente"
});
```

**Cruce de fin de semana** (viernes a lunes; solo viernes y lunes pasan a `Justificado`):
```javascript
recordJustification({
  studentId: "E-1004",
  startDate: "2026-10-09",
  endDate: "2026-10-12",
  type: "Personal",
  reason: "Viaje familiar"
});
```

---

## 4. 🏫 Cursos, jornadas y resumen

```javascript
changeCourseJornada("CUR-1A", "Tarde");   // luego devolver a "Mañana"
changeCourseJornada("N-101", "Mañana");   // ID antiguo, mismo curso
changeCourseJornada("CUR-1A", "Madrugada"); // INVALID_JORNADA

getCourseIdMapping();                      // tabla ID sugerido <-> ID existente
ensureSchema();                            // no destructivo, idempotente

generateWeeklySummary({ referenceDate: "2026-10-07", send: false });
generateWeeklySummary({ referenceDate: "2026-10-07", levelId: "CUR-1A", send: false });
generateWeeklySummary({ referenceDate: "2026-10-07", jornada: "Mañana", send: false });
```

---

## 5. 🔌 Payloads del Webhook

Reemplace `<WEBHOOK_TOKEN>` por el valor generado con `generateWebhookToken()`. **No** guarde el token real en este repositorio.

### 5.1 Registrar asistencia (Docente)
```json
{
  "token": "<WEBHOOK_TOKEN>",
  "evento": "ASISTENCIA_REGISTRAR",
  "usuario": "docente.perez@cepatagonia.cl",
  "datos": { "id_estudiante": "E-1001", "fecha": "2026-10-05", "estado": "Presente", "observacion": "Prueba", "hora": "09:30" }
}
```

### 5.2 Actualizar asistencia
```json
{
  "token": "<WEBHOOK_TOKEN>",
  "evento": "ASISTENCIA_ACTUALIZAR",
  "usuario": "docente.perez@cepatagonia.cl",
  "datos": { "id_estudiante": "E-1001", "fecha": "2026-10-05", "estado": "Atrasado" }
}
```

### 5.3 Cambiar jornada (Administrador)
```json
{
  "token": "<WEBHOOK_TOKEN>",
  "evento": "CURSO_CAMBIAR_JORNADA",
  "usuario": "francisco.info@cepatagonia.cl",
  "datos": { "id_nivel": "CUR-1A", "jornada": "Tarde" }
}
```

### 5.4 Solicitar justificativo (Inspector)
```json
{
  "token": "<WEBHOOK_TOKEN>",
  "evento": "JUSTIFICATIVO_SOLICITAR",
  "usuario": "inspectora.gomez@cepatagonia.cl",
  "datos": {
    "id_estudiante": "E-1002",
    "fecha_inicio": "2026-10-05",
    "fecha_fin": "2026-10-06",
    "tipo": "Médico",
    "motivo": "Reposo médico",
    "estado_aprobacion": "Aprobado"
  }
}
```
> El campo `estado_aprobacion` se **ignora**: el justificativo se crea siempre en `Pendiente`.

### 5.5 Aprobar justificativo
```json
{
  "token": "<WEBHOOK_TOKEN>",
  "evento": "JUSTIFICATIVO_ACTUALIZAR",
  "usuario": "inspectora.gomez@cepatagonia.cl",
  "datos": { "id_justificativo": "<ID_DEL_JUSTIFICATIVO>", "estado_aprobacion": "Aprobado", "comentario": "Certificado verificado" }
}
```

### 5.6 Casos de error esperados

| Variación | Resultado |
| :--- | :--- |
| Token alterado | `UNAUTHORIZED` |
| `usuario` = `docente.perez@…` en `CURSO_CAMBIAR_JORNADA` | `FORBIDDEN` |
| `usuario` inexistente | `FORBIDDEN` |
| `fecha` = `2026-10-10` | `INVALID_DAY` |
| `hora` = `08:30` (curso Mañana) | `OUT_OF_SCHEDULE` |
| `evento` = `OTRO_EVENTO` | `BAD_REQUEST` |
| `datos` = `[]` | `BAD_REQUEST` |

---

## 6. 🧪 Script de Simulación Completa de Flujo

Pegar y ejecutar desde el editor de Apps Script (`clasp open` → Ejecutar → `runFullSystemSimulation`). Requiere `seedTestData()` previo y un usuario Administrador activo.

```javascript
function runFullSystemSimulation() {
  // --- 1. Validación estructural ---
  Logger.log("=== 1. Validando estructura del libro ===");
  validateWorkbook();

  // --- 2. Asistencia masiva del curso CUR-1A (3 alumnos, lunes) ---
  Logger.log("=== 2. Toma de asistencia masiva para CUR-1A ===");
  const bulkResult = recordBulkAttendance(
    [
      { studentId: "E-1001", status: "Presente", observation: "Simulación TC-05" },
      { studentId: "E-1002", status: "Ausente",  observation: "Simulación TC-05" },
      { studentId: "E-1003", status: "Atrasado", observation: "Simulación TC-05" }
    ],
    "2026-10-05"
  );
  Logger.log("Resultado bulk: " + JSON.stringify(bulkResult));

  // --- 3. Ingreso y aprobación de justificativo para E-1002 ---
  Logger.log("=== 3. Justificativo médico para E-1002 ===");
  const justResult = recordJustification({
    studentId:      "E-1002",
    startDate:      "2026-10-05",
    endDate:        "2026-10-05",
    type:           "Médico",
    reason:         "Certificado de reposo médico - Simulación",
    approvalStatus: "Pendiente"
  });
  Logger.log("Justificativo creado: " + justResult.justificationId);

  const approvalResult = updateJustificationStatus(
    justResult.justificationId,
    "Aprobado",
    "Aprobación automática de simulación"
  );
  Logger.log("Aprobación resultado: " + JSON.stringify(approvalResult));

  // --- 4. Verificar asistencia post-aprobación (debe ser "Justificado") ---
  Logger.log("=== 4. Verificación asistencia E-1002 post-aprobación ===");
  const attendanceHistory = getAttendanceForStudent("E-1002", "2026-10-05", "2026-10-05");
  Logger.log("Estado E-1002: " + (attendanceHistory[0] ? attendanceHistory[0].estado : "SIN REGISTRO"));

  // --- 5. Reglas de día y horario (deben fallar) ---
  Logger.log("=== 5. Reglas de día y horario ===");
  ["2026-10-10", "2026-10-11"].forEach(d => {
    try { recordAttendance("E-1001", d, "Presente"); Logger.log("ERROR: se aceptó " + d); }
    catch (e) { Logger.log("OK rechazado " + d + ": " + e.message); }
  });
  try { recordAttendance("E-1004", "2026-10-06", "Presente", "", { time: "08:30" }); Logger.log("ERROR: se aceptó 08:30"); }
  catch (e) { Logger.log("OK rechazado 08:30: " + e.message); }

  // --- 6. Resumen semanal (sin correo) ---
  Logger.log("=== 6. Resumen semanal ===");
  Logger.log(JSON.stringify(generateWeeklySummary({ referenceDate: "2026-10-05", send: false })));

  // --- 7. Reporte de asistencia del curso CUR-1A ---
  Logger.log("=== 7. Generando reporte del curso CUR-1A ===");
  exportLevelReportToSheet("CUR-1A");

  // --- 8. Prueba de bitácora de auditoría ---
  Logger.log("=== 8. Prueba de auditoría ===");
  testAudit();

  Logger.log("✅ Simulación completa finalizada.");
}
```
