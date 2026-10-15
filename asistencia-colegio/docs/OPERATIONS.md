# 🛠️ Manual de Operación y Mantenimiento: `Asistencia Colegio`

Procedimientos estándar de trabajo (SOP), mantenimiento y troubleshooting para administradores, inspectores y docentes.

---

## 1. 📅 Flujo de Operación Diario

### 1.1 Docentes (Toma de Asistencia por Clase / Curso)

1. Abrir la app **Asistencia Colegio** en el dispositivo institucional.
2. Seleccionar la vista **"Tomar Asistencia"** o la lista del curso.
3. Marcar cada alumno:
   - 🟢 **Presente** — alumno en sala al inicio de la jornada.
   - 🟡 **Atrasado** — alumno ingresa con atraso.
   - 🔴 **Ausente** — alumno sin justificar.
4. Presionar **Guardar / Sincronizar**. Si no hay conexión, AppSheet guarda offline y sincroniza al restaurar la red.

> **Restricción de asignación:** un Docente solo puede registrar alumnos de cursos que tenga en la hoja `Asignaciones`. Intentar registrar un alumno de otro curso devuelve `FORBIDDEN` y no escribe nada.

### 1.2 Inspectoría (Ingreso de Justificativos)

1. Recibir el certificado o comprobante del apoderado.
2. En AppSheet: vista **"Ingreso de Justificativo"** → seleccionar estudiante, `fecha_inicio`, `fecha_fin`, tipo y adjuntar el archivo.
3. El archivo sube automáticamente a `Justificativos_Escolares/{Año}` en Google Drive.

### 1.3 Directivo / Inspector (Aprobación de Justificativos)

1. En AppSheet o directamente en `Justificativos`, cambiar `estado_aprobacion` a `Aprobado` o `Rechazado`.
2. Al aprobar:
   - El sistema marca como `Justificado` cada día hábil (lun–vie) del rango.
   - Si ya existía un registro de asistencia, lo actualiza conservando su jornada original.
   - Si falla la escritura, se deshace la operación completa (rollback) sin datos parciales.
3. Al rechazar: no se toca la hoja `Asistencias`.

> **Un solo bloqueo:** aprobación + aplicación de asistencia ocurren dentro del mismo lock. No hay riesgo de bloqueo anidado.

---

## 2. 🛡️ Gobierno de Datos y Auditoría

### 2.1 Bitácora de Auditoría (`Auditoria`)

- Registra en tiempo real **quién**, **cuándo** y **qué** acción se realizó.
- Cada evento tiene ID único (UUID), timestamp, correo del actor, tabla afectada y detalle.
- **Regla:** ningún usuario no-administrador debe borrar ni modificar filas en `Auditoria`.

### 2.2 Trazabilidad de Ediciones Manuales

- El trigger `onEdit(e)` intercepta ediciones directas en `Asistencias`, `Justificativos`, `Usuarios` y `Niveles` y registra el valor anterior y el nuevo en `Auditoria`.
- Las ediciones en la fila 1 (encabezados) no se auditan.

---

## 3. 📊 Informes y Alertas

### 3.1 Informe por Curso (Bajo Demanda)

1. **Asistencia → Generar reporte de curso** → ingresar ID o nombre.
2. El sistema crea o actualiza la pestaña `Reporte_Asistencia` con formato institucional; resalta en rojo alumnos con asistencia < 85%.

### 3.2 Resumen Semanal Automático

- Cada **viernes a las 22:40** (después del cierre de la jornada Noche) se ejecuta `runWeeklyAttendanceSummary`.
- El resumen es **idempotente**: si ya existe para esa semana y alcance, no se duplica.

> ⚠️ **No generes el resumen global manualmente antes de las 22:40 del viernes**: la idempotencia lo marcaría como duplicado y el automático de las 22:40 quedaría bloqueado, perdiendo los registros tardíos de la jornada Noche.
> Usa un alcance diferente (`jornada`, `levelId`) si necesitas un resumen parcial antes de esa hora.

### 3.3 Destinatarios del Resumen por Correo

- Configura los correos en la hoja `Configuracion`, clave `resumen_semanal_destinatarios`, separados por coma.
- Correos inválidos se ignoran automáticamente.
- Sin destinatarios configurados, el resumen se guarda en `Resumenes` sin enviar correo (sin error).

### 3.4 Alerta Semanal de Riesgo

- Cada **viernes a las 22:40**, `runWeeklyAtRiskAlertDigest` audita la matrícula completa y registra en `Auditoria` la lista de alumnos con asistencia < 85%.

---

## 4. 🔧 Troubleshooting

| Problema / Síntoma | Causa Probable | Solución |
| :--- | :--- | :--- |
| `❌ Errores de Estructura Detectados` al validar | Se eliminó o renombró una columna o pestaña | **Asistencia → Validar estructura** → restaurar el nombre exacto en la fila 1 |
| `FORBIDDEN` al registrar asistencia como Docente | El alumno es de un curso no asignado al docente | Verificar la hoja `Asignaciones`; si falta la relación, un Administrador la agrega |
| `FORBIDDEN` sin usuario identificable | Ejecución anónima o desde un disparador sin contexto de usuario | Las funciones de registro requieren un actor explícito (`actor` en el webhook) o sesión de usuario activa |
| El justificativo no cambia el estado a `Justificado` | `estado_aprobacion` sigue en `Pendiente` | Cambiar a `Aprobado` desde AppSheet o la hoja; la aplicación es automática |
| `Lock timeout` en Apps Script | Dos llamadas simultáneas al webhook agotaron el tiempo de espera del lock (15 s) | Reintentar; el diseño garantiza que no quedan datos parciales |
| Resumen semanal marcado como duplicado antes de las 22:40 | Se generó un resumen global manualmente antes del automático | El resumen del viernes tardío (jornada Noche) no será incluido en ese resumen; generar uno nuevo con alcance diferente para el período restante |
| Fallo al subir archivos a Drive | Cuota agotada o permisos de la carpeta restringidos | Verificar espacio en Drive y permisos de la carpeta `Justificativos_Escolares` |
| Menú `Asistencia` no aparece | La hoja se abrió antes de cargar los scripts | Recargar la página (`F5`). Si persiste, verificar disparadores con `setupSystemTriggers()` |

---

## 5. 🔄 Mantenimiento Anual

1. **Respaldar el libro:** duplicar la planilla al finalizar el año (ej: `Asistencia_Colegio_2026_BACKUP`).
2. **Limpiar transacciones:** vaciar `Asistencias`, `Justificativos` y `Auditoria` para el nuevo año.
3. **Actualizar matrícula:** cargar alumnos, cursos y asignaciones actualizados en `Estudiantes`, `Niveles` y `Asignaciones`.
4. **Verificar estructura:** ejecutar `checkConfiguracionSetup()` y **Asistencia → Validar estructura**.
5. **Reinstalar disparadores:** ejecutar `setupSystemTriggers()` para actualizar los horarios calculados.
