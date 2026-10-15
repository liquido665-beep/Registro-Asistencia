# 🧪 Plan de Pruebas: `Asistencia Colegio`

## 📌 Resumen
Plan de pruebas manuales por módulo. Todas las pruebas deben ejecutarse sobre una **copia** de la planilla (o con datos de `seedTestData()`), nunca sobre datos reales de producción.

**Convenciones de fecha** (calendario de octubre 2026): lunes `2026-10-05`, martes `06`, jueves `08`, viernes `09`, sábado `10`, domingo `11`. IDs y datos en [`tests/test-data.md`](../tests/test-data.md).

| Módulo | Sección |
| :--- | :--- |
| Validación de estructura (`validateWorkbook`) | §1 |
| Preparación de estructura (`ensureSchema`) | §2 |
| Cursos y jornadas | §3 |
| Reglas de asistencia (día y horario) | §4 |
| Resumen semanal | §5 |
| Webhook | §6 |
| Disparadores | §7 |

---

## 1. 🔍 Validación de estructura: `validateWorkbook()`

La función es **100% no destructiva** (solo lectura). Revisa las **11 pestañas** de `CONFIG.SHEETS`: `Configuracion`, `Usuarios`, `Niveles`, `Estudiantes`, `Asignaciones`, `Asistencias`, `Justificativos`, `Auditoria`, `Resumenes`, `App_Transacciones` y `App_Solicitudes`, con sus encabezados de `CONFIG.REQUIRED_HEADERS`.

### Caso 1.1: Estructura completa y correcta
- **Precondiciones**: libro con las 11 pestañas y sus columnas en la fila 1; cursos con jornada válida.
- **Pasos**: menú **Asistencia > Validar estructura**.
- **Esperado**: `✅ Validación Exitosa - Todas las pestañas y encabezados requeridos están presentes en el libro.`
- **Modificación**: 0 filas creadas, editadas o eliminadas.

### Caso 1.2: Pestaña faltante
- **Precondiciones**: renombrar temporalmente `Justificativos`.
- **Esperado**: `❌ Errores de Estructura Detectados:` → `📌 Pestañas Faltantes:` → `• Justificativos`.

### Caso 1.3: Columna faltante
- **Precondiciones**: en `Estudiantes`, borrar el encabezado `email_apoderado`.
- **Esperado**: `📌 Columnas/Encabezados Faltantes:` → `• En "Estudiantes": faltan (email_apoderado)`.

### Caso 1.4: Tolerancia a mayúsculas y espacios
- **Precondiciones**: cambiar `id_usuario` a ` ID_USUARIO ` en `Usuarios`.
- **Esperado**: se reconoce el encabezado, sin falso positivo.

### Caso 1.5: Advertencias de cursos/horarios
- **Precondiciones**: estructura completa; en `Niveles` dejar vacía la `jornada` de `CUR-1A`.
- **Esperado**: `⚠️ Estructura correcta, pero hay advertencias de cursos/horarios:` con `Curso CUR-1A: jornada vacía o inválida`.
- **Variante**: poner `estado = Suspendido` en un curso → advertencia de estado inválido.
- **Variante**: duplicar un `id_nivel` → advertencia `ID de curso duplicado`.

---

## 2. 🛠️ Preparación de estructura: `ensureSchema()` / `prepareStructure()`

### Caso 2.1: Crea pestañas faltantes
- **Precondiciones**: eliminar la pestaña `Resumenes`.
- **Pasos**: **Asistencia > Preparar estructura (no destructivo)**.
- **Esperado**: la pestaña se crea con sus encabezados en negrita; el diálogo lista `Pestañas creadas: Resumenes`; el resto de las hojas no cambia.

### Caso 2.2: Agrega columnas al final
- **Precondiciones**: en `Niveles`, eliminar las columnas `jornada` y `estado`.
- **Esperado**: se agregan **al final**, sin mover ni borrar datos; el diálogo lista `Columnas agregadas`.

### Caso 2.3: Idempotencia
- **Pasos**: ejecutar dos veces seguidas.
- **Esperado**: la segunda vez informa `ninguna` pestaña y columna creada; sin duplicados.

### Caso 2.4: Catálogo de cursos
- **Precondiciones**: `Niveles` con `N-101`…`N-105` (IDs antiguos).
- **Esperado**: **no** se duplican (se reconocen por alias, p. ej. `N-101` ≡ `CUR-1A`); se completan solo campos vacíos; se crean `CUR-2B`, `CUR-2C`, `CUR-2D`, `CUR-3A` si faltan. Si el nombre en la hoja difiere del catálogo, aparece una advertencia y se conserva el de la hoja.
- **Auditoría**: eventos `CREAR_CURSO`, `MODIFICAR_CURSO` y `ESTRUCTURA_ACTUALIZADA`.

---

## 3. 🏫 Cursos y jornadas

### Caso 3.1: Cambiar jornada (Administrador)
- **Pasos**: **Asistencia > Cambiar jornada de un curso** → ID `CUR-1A` → `Tarde`.
- **Esperado**: mensaje `Jornada del curso … cambiada de "Mañana" a "Tarde"`; `Niveles.jornada` y `fecha_modificacion` actualizadas; auditoría `CAMBIAR_JORNADA_CURSO` con anterior, nueva y actor.

### Caso 3.2: Mismo valor
- **Pasos**: repetir el caso anterior con `Tarde`.
- **Esperado**: `ℹ️ … ya tenía la jornada "Tarde". Sin cambios.` y sin nueva auditoría.

### Caso 3.3: Jornada inválida
- **Pasos**: indicar `Madrugada`.
- **Esperado**: `❌ Jornada inválida: "Madrugada". Válidas: Mañana, Tarde, Noche.`

### Caso 3.4: Rol sin permiso
- **Precondiciones**: ejecutar con un usuario `Docente` o `Inspector`.
- **Esperado**: `El rol "…" no tiene permiso para cambiar la jornada de un curso.`

### Caso 3.5: Histórico intacto
- **Precondiciones**: asistencia ya registrada para un alumno de `CUR-1A` mientras era `Mañana`; luego cambiar el curso a `Tarde`.
- **Esperado**: ese registro conserva `jornada = Mañana`. Una nueva asistencia del mismo curso se guarda con `Tarde`.

### Caso 3.6: Curso inexistente / ID antiguo
- `CUR-9Z` → `No existe el curso "CUR-9Z".`
- `N-101` → resuelve al mismo curso que `CUR-1A`.

### Caso 3.7: Curso inactivo
- **Precondiciones**: poner `estado = Inactivo` en un curso.
- **Esperado**: registrar asistencia de sus alumnos falla con `El curso "…" está inactivo.`; el curso no aparece en los resúmenes diario ni semanal.

---

## 4. 📅 Reglas de asistencia: día y horario

Usar un alumno de `CUR-1A` (jornada **Mañana**: inicio 09:00; la ventana llega hasta el fin del último bloque de clase: lun–jue 13:00 y viernes 12:10). La estructura de bloques y recesos de cada jornada se verifica en §4.1.

| ID | Entrada | Esperado |
| :--- | :--- | :--- |
| 4.1 | Fecha lunes `2026-10-05`, sin hora | ✅ Se registra. |
| 4.2 | Fecha sábado `2026-10-10` | ❌ `INVALID_DAY`: solo lunes a viernes. |
| 4.3 | Fecha domingo `2026-10-11` | ❌ `INVALID_DAY`. |
| 4.4 | Fecha `2026-02-31` | ❌ Fecha inválida. |
| 4.5 | Lunes `09:30` | ✅ |
| 4.6 | Lunes `08:59` | ❌ `OUT_OF_SCHEDULE` (antes del inicio). |
| 4.7 | Lunes `13:00` | ✅ (extremo inclusivo). |
| 4.8 | Lunes `13:01` | ❌ `OUT_OF_SCHEDULE`. |
| 4.9 | Viernes `2026-10-09` a las `12:10` | ✅ (el viernes termina con el bloque 4). |
| 4.10 | Viernes `12:11` | ❌ `OUT_OF_SCHEDULE` (el receso final no amplía la ventana). |
| 4.11 | Hora `9:30` o `25:00` | ❌ `INVALID_TIME` (se exige `HH:mm`). |
| 4.12 | `jornada = "Tarde"` para un curso de Mañana | ❌ `JORNADA_MISMATCH`. |
| 4.13 | Estado `Faltó` | ❌ `INVALID_STATUS`. |
| 4.14 | Mismo alumno y fecha, modo `upsert` | Actualiza la fila (`UPDATED`), sin duplicar. |
| 4.15 | Registro masivo (`recordBulkAttendance`) un sábado | ❌ Rechaza todo el lote. |

Repetir 4.5–4.10 con un curso de **Tarde** (14:30–18:30; viernes 14:30–17:40) y de **Noche** (19:00–23:00; viernes 19:00–22:10).

### 4.1 Estructura de bloques y recesos por jornada

Se verifica de forma **automática** (`node --test tests/schedule.test.js`) y visualmente en **Asistencia > Ver horarios de jornadas**.

| Día | Estructura esperada (en este orden) |
| :--- | :--- |
| Lunes a jueves | Bloque 1 (45) → Bloque 2 (45) → Receso (10) → Bloque 3 (45) → Bloque 4 (45) → Receso (5) → Bloque 5 (45) |
| Viernes | Bloque 1 (45) → Bloque 2 (45) → Receso (10) → Bloque 3 (45) → Bloque 4 (45) → Receso (10); sin bloque 5 |

| Jornada | Inicio | Fin de clases lun–jue | Fin de clases viernes | Fin del receso final (viernes) |
| :--- | :--- | :--- | :--- | :--- |
| Mañana | 09:00 | 13:00 | 12:10 | 12:20 |
| Tarde | 14:30 | 18:30 | 17:40 | 17:50 |
| Noche | 19:00 | 23:00 | 22:10 | 22:20 |

- Los elementos son consecutivos: cada uno empieza cuando termina el anterior (sin solapamientos ni pausas implícitas).
- Los inicios (09:00, 14:30, 19:00) son los configurados; no se modifican.
- Prueba manual: abrir **Asistencia > Ver horarios de jornadas** y contrastar con las tablas.

**Justificativos y fines de semana**: aprobar un justificativo del viernes al lunes marca `Justificado` solo el viernes y el lunes (sábado y domingo se omiten).

---

## 5. 📊 Resumen semanal

### Caso 5.1: Generación manual
- **Precondiciones**: asistencia registrada durante la semana; existe la hoja `Resumenes`.
- **Pasos**: **Asistencia > Generar resumen semanal**.
- **Esperado**: diálogo con registros, porcentaje y `Correo enviado: no/sí`; una fila nueva en `Resumenes` con `clave = SEM-{lunes}_{viernes}-GLOBAL`; auditoría `RESUMEN_SEMANAL_GENERADO`.

### Caso 5.2: Idempotencia
- **Pasos**: ejecutar de nuevo en la misma semana.
- **Esperado**: `ℹ️ … ya existe … No se duplicó.`; sin fila nueva; auditoría `RESUMEN_SEMANAL_OMITIDO`.

### Caso 5.3: Hoja faltante
- **Precondiciones**: eliminar `Resumenes`.
- **Esperado**: error `Falta la hoja "Resumenes". Ejecute Asistencia > Preparar estructura.`

### Caso 5.4: Solo lunes a viernes
- **Precondiciones**: insertar a mano un registro con fecha sábado.
- **Esperado**: no se cuenta en los totales.

### Caso 5.5: Alcances (desde el editor)
```javascript
generateWeeklySummary({ referenceDate: '2026-10-07', jornada: 'Mañana', send: false });
generateWeeklySummary({ referenceDate: '2026-10-07', levelId: 'CUR-1A', send: false });
generateWeeklySummary({ referenceDate: '2026-10-07', grado: 1, send: false });
generateWeeklySummary({ referenceDate: '2026-10-07', teacherEmail: 'docente.perez@cepatagonia.cl', send: false });
```
- **Esperado**: cada llamada crea una clave distinta (`…-jornada=Mañana`, `…-curso=CUR-1A`, `…-nivel=1`, `…-docente=…`); los totales corresponden al filtro. Un curso o docente inexistente → `NOT_FOUND`; jornada inválida → `INVALID_JORNADA`.

### Caso 5.6: Correo
- **Precondiciones**: destinatarios válidos separados por coma en la clave `resumen_semanal_destinatarios` de la hoja `Configuracion`.
- **Esperado**: llega un correo con el texto del resumen y la fila guarda los `destinatarios`. Sin destinatarios, no se envía nada y `send` no genera error.
- **Fallo de envío**: se audita `RESUMEN_SEMANAL_ERROR_ENVIO` y el resumen se guarda igual.

---

## 6. 🔌 Webhook

Ejecutar primero `generateWebhookToken()`. Pruebas locales sin HTTP con `testWebhookLocally()` (editar `evento` y `datos`); para HTTP real, usar la URL `/exec` con `curl` o el bot de AppSheet.

```bash
curl -L -X POST "<URL_EXEC>" -H "Content-Type: application/json" -d '{
  "token": "<WEBHOOK_TOKEN>",
  "evento": "ASISTENCIA_REGISTRAR",
  "usuario": "docente.perez@cepatagonia.cl",
  "datos": { "id_estudiante": "E-1001", "fecha": "2026-10-05", "estado": "Presente", "hora": "09:30" }
}'
```

### 6.1 Autenticación y formato

| ID | Escenario | Esperado |
| :--- | :--- | :--- |
| W-01 | Token correcto, datos válidos | `status: success`. |
| W-02 | Token incorrecto o ausente | `error` / `UNAUTHORIZED`; auditoría `WEBHOOK_RECHAZADO`. |
| W-03 | `WEBHOOK_TOKEN` no configurado | `error` / `NOT_CONFIGURED` (mensaje genérico). |
| W-04 | Varios rechazos en menos de 1 minuto | Solo **un** `WEBHOOK_RECHAZADO` en `Auditoria`. |
| W-05 | Cuerpo vacío o JSON mal formado | `BAD_REQUEST`. |
| W-06 | `usuario` no es un email | `BAD_REQUEST`. |
| W-07 | `usuario` no existe o está `Inactivo` | `FORBIDDEN`. |
| W-08 | `evento` desconocido | `BAD_REQUEST` listando los eventos soportados. |
| W-09 | `datos` ausente o es un arreglo | `BAD_REQUEST`. |
| W-10 | Error interno forzado | Respuesta `ERROR_INTERNO` genérica; detalle en `Auditoria` (`WEBHOOK_ERROR`). |

### 6.2 Eventos y permisos

| ID | Escenario | Esperado |
| :--- | :--- | :--- |
| W-11 | `ASISTENCIA_REGISTRAR` como Docente con el curso asignado | ✅ `Asistencia registrada.` |
| W-12 | Igual, con alumno de un curso **no** asignado | ❌ `FORBIDDEN`. |
| W-13 | Registrar dos veces el mismo alumno y fecha | 2.ª vez: `DUPLICATE`. |
| W-14 | `ASISTENCIA_ACTUALIZAR` sin registro previo | `NOT_FOUND`. |
| W-15 | `ASISTENCIA_ACTUALIZAR` con registro | ✅ `Asistencia actualizada.` |
| W-16 | Sábado / hora fuera de jornada | `INVALID_DAY` / `OUT_OF_SCHEDULE`. |
| W-17 | `CURSO_CAMBIAR_JORNADA` como Administrador | ✅ y auditoría. |
| W-18 | `CURSO_CAMBIAR_JORNADA` como Docente | `FORBIDDEN`. |
| W-19 | `JUSTIFICATIVO_SOLICITAR` como Inspector, enviando `estado_aprobacion: "Aprobado"` en `datos` | Se crea en `Pendiente` (el campo se ignora). |
| W-20 | `JUSTIFICATIVO_SOLICITAR` como Docente | `FORBIDDEN`. |
| W-21 | `JUSTIFICATIVO_ACTUALIZAR` → `Aprobado` como Directivo | ✅ días lun–vie pasan a `Justificado`. |
| W-22 | `JUSTIFICATIVO_ACTUALIZAR` con ID inexistente | Error "no fue encontrado". |
| W-23 | Campo de texto que excede el máximo (observación > 500) | `BAD_REQUEST`. |

---

## 7. ⏰ Disparadores

| ID | Escenario | Esperado |
| :--- | :--- | :--- |
| T-01 | **Asistencia > Instalar disparadores automáticos** | 3 disparadores temporales (diario a las 23:00, resumen semanal y alerta de riesgo a las **22:40** del viernes); auditoría `CONFIGURAR_DISPARADORES`. |
| T-02 | Reinstalar | Sin duplicados; se eliminan y recrean solo los del sistema. |
| T-03 | `runDailyAttendanceDigest()` en día hábil | Auditoría `RESUMEN_DIARIO_ASISTENCIA` con `registrados/activos` y cursos pendientes. |
| T-04 | `runDailyAttendanceDigest()` en sábado o domingo | Se omite y solo registra en el log. |
| T-05 | `runWeeklyAttendanceSummary()` | Igual que 5.1 con `generado_por = SISTEMA`. |
| T-06 | `runWeeklyAtRiskAlertDigest()` | Auditoría `ALERTA_SEMANAL_RIESGO` con alumnos < 85%. |
| T-07 | Editar manualmente una celda de `Asistencias`, `Justificativos`, `Usuarios` o `Niveles` | `EDICION_MANUAL_HOJA` con valor anterior y nuevo. |
| T-08 | Editar la fila 1 (encabezados) | No se audita. |

---

## 8. 🔐 Control de acceso y bloqueo

| ID | Escenario | Esperado |
| :--- | :--- | :--- |
| R-01 | Registrar asistencia como Administrador | ✅ Siempre permitido. |
| R-02 | Registrar asistencia como Inspector | ✅ Sin restricción de cursos. |
| R-03 | Registrar asistencia como Docente en curso asignado | ✅ |
| R-04 | Registrar asistencia como Docente en curso **no** asignado | ❌ `FORBIDDEN`. Sin escrituras. |
| R-05 | Lote de asistencia (Docente): un alumno en curso no asignado | ❌ `FORBIDDEN`. Todo el lote se aborta. |
| R-06 | Aprobar justificativo como Directivo | ✅ |
| R-07 | Aprobar justificativo como Docente | ❌ `FORBIDDEN`. Justificativo queda `Pendiente`. |
| R-08 | Registrar asistencia sin usuario identificable (sin actor) | ❌ `FORBIDDEN`. |
| R-09 | Aprobar justificativo + simular fallo de escritura | Rollback: asistencia vuelve al estado anterior, justificativo queda `Pendiente`, sin auditoría. |
| R-10 | Dos llamadas simultáneas al webhook | Una ejecuta, la otra espera (lock). Si agota el tiempo: `Lock timeout`; sin datos parciales. |

---

## ✅ Criterio de aceptación

- Todas las pruebas de las secciones 1–8 pasan en una copia de la planilla.
- Ningún caso modifica datos fuera de los esperados (revisar `Auditoria`).
- Las pruebas automáticas locales pasan al 100%: `node --test tests/` (110 casos: 35 de jornadas + 75 de servicios).
