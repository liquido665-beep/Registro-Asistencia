# Sistema de Asistencia Escolar (asistencia-colegio)

Sistema integral de gestión de asistencia escolar y justificativos médicos/personales integrando **Google Apps Script**, **Google Sheets**, **Google Drive** y **AppSheet**.

---

## ✨ Funcionalidades

| Área | Qué hace |
| :--- | :--- |
| **Asistencia** | Registro individual y masivo, con detección de duplicados por alumno y fecha. Solo **lunes a viernes**. |
| **Cursos y jornadas** | Catálogo de cursos con jornada **Mañana / Tarde / Noche**. Horarios distintos de lunes a jueves y el viernes. Cambio de jornada solo para el Administrador. |
| **Justificativos** | Registro con adjunto en Drive, aprobación/rechazo y sincronización automática de los días a `Justificado`. |
| **Resumen semanal** | Resumen por curso, jornada, nivel y docente, guardado en la hoja `Resumenes` y enviado por correo (opcional). Idempotente. |
| **Reportes y alertas** | Reporte por curso en `Reporte_Asistencia` y alerta semanal de alumnos con asistencia < 85%. |
| **Webhook AppSheet** | Endpoint `doPost` autenticado por token para que AppSheet registre asistencia y justificativos pasando por las reglas de negocio. |
| **Auditoría** | Bitácora de cada acción y de las ediciones manuales en hojas críticas. |
| **Estructura no destructiva** | `Preparar estructura` crea pestañas/columnas faltantes sin borrar ni reordenar datos. |

---

## 📐 Estructura del Proyecto

```text
asistencia-colegio/
├── README.md                   # Documentación general del repositorio
├── .gitignore                  # Archivos ignorados por Git
├── .env.example                # Variables de ejemplo (no contiene secretos reales)
├── .clasp.json                 # Configuración del proyecto Clasp (rootDir: "src")
│
├── src/                        # Código fuente Apps Script (V8) — fuente de verdad para clasp
│   ├── Config.gs               # Constantes: hojas, encabezados, jornadas, horarios, catálogo de cursos
│   ├── Main.gs                 # onOpen y menú "Asistencia"
│   ├── SheetService.gs         # Operaciones de lectura/escritura sobre hojas
│   ├── AccessService.gs        # AppError y control de acceso por rol
│   ├── ScheduleService.gs      # Días hábiles, jornadas y ventanas horarias
│   ├── CourseService.gs        # Cursos (hoja Niveles): catálogo, alias de IDs, cambio de jornada
│   ├── SchemaService.gs        # Preparación no destructiva de pestañas y columnas
│   ├── AttendanceService.gs    # Toma de asistencia (individual y masiva)
│   ├── JustificationService.gs # Justificativos y archivos en Drive
│   ├── AuditService.gs         # Bitácora de auditoría
│   ├── ReportService.gs        # Reportes y métricas por curso
│   ├── SummaryService.gs       # Resumen semanal (hoja Resumenes + correo)
│   ├── ValidationService.gs    # Validación de estructura e integridad
│   ├── Webhook.gs              # Endpoint doPost(e) para AppSheet
│   ├── Triggers.gs             # Disparadores temporales y onEdit
│   ├── Seed.gs                 # Carga de datos de prueba (no destructiva)
│   └── appsscript.json         # Manifest usado por clasp (scopes, zona horaria)
│
├── docs/                       # Documentación técnica
│   ├── ARCHITECTURE.md         # Arquitectura del sistema y flujo de datos
│   ├── DATA_MODEL.md           # Modelo de entidad-relación y tablas
│   ├── SECURITY.md             # Matriz de permisos y gobierno de datos
│   ├── APPSHEET_CONFIGURATION.md # Integración con AppSheet y contrato del webhook
│   ├── DEPLOYMENT.md           # Guía de despliegue con Clasp
│   ├── OPERATIONS.md           # Manual de operación y mantenimiento
│   └── TEST_PLAN.md            # Plan de pruebas por módulo
│
├── data/                       # Datasets iniciales (CSV)
│   ├── usuarios.csv
│   ├── niveles.csv             # IDs antiguos (N-101...), equivalentes a CUR-1A... (ver más abajo)
│   ├── estudiantes.csv
│   └── asignaciones.csv
│
├── tests/                      # Casos de prueba locales (no se suben a Apps Script)
│   ├── helpers/
│   │   └── gas-sim.js          # Simulador de GAS en memoria (sin dependencias)
│   ├── schedule.test.js        # Pruebas de jornadas y horarios (35 casos)
│   ├── services.test.js        # Pruebas de servicios: roles, bloqueos, rendimiento, webhook (75 casos)
│   ├── google-verification-plan.md  # Plan de verificación manual en Google Apps Script
│   ├── manual-test-cases.md
│   └── test-data.md
│
└── .agents/                    # Contexto para agentes de IA
    └── skills/                 # Habilidades especializadas
```

---

## 🗂️ Hojas del libro de Google Sheets

Definidas en [`src/Config.gs`](src/Config.gs) (`CONFIG.SHEETS` y `CONFIG.REQUIRED_HEADERS`):

| Hoja | Uso |
| :--- | :--- |
| `Configuracion` | Pares `clave/valor` de configuración del sistema (ej: `resumen_semanal_destinatarios`). |
| `Usuarios` | Funcionarios, rol y estado (`Activo` / `Inactivo`). |
| `Niveles` | Cursos: `id_nivel`, `nombre_nivel`, `grado`, `seccion`, `jornada`, `estado`, fechas. |
| `Estudiantes` | Alumnos y apoderados. |
| `Asignaciones` | Asignación de docentes a cursos. |
| `Asistencias` | Registros de asistencia; cada uno guarda la `jornada` vigente al registrarse. |
| `Justificativos` | Justificativos y su estado de aprobación. |
| `Auditoria` | Bitácora de acciones. |
| `Resumenes` | Copia de cada resumen semanal generado. |
| `App_Transacciones` | Reservada para la integración con AppSheet (sin lógica en el código; no modificar). |
| `App_Solicitudes` | Reservada para la integración con AppSheet (sin lógica en el código; no modificar). |

> **Manifest:** `src/appsscript.json` es la **única** fuente de verdad. El archivo de la raíz fue eliminado. `clasp` usa `rootDir: "src"` (.clasp.json).

Si una pestaña o columna falta, ejecute **Asistencia > Preparar estructura (no destructivo)**.

---

## 🕒 Cursos, jornadas y horarios

Los **inicios** de jornada están en `CONFIG.SCHEDULES` y la **estructura** de bloques y recesos en `CONFIG.DAY_PATTERNS` (igual para las tres jornadas). Los horarios de cada bloque y receso se **calculan** de forma consecutiva desde el inicio (`buildDaySchedule_` en `ScheduleService.gs`); no hay horas de término fijas. Formato 24 h.

| Día | Estructura |
| :--- | :--- |
| **Lunes a jueves** | Bloque 1 (45) → Bloque 2 (45) → Receso (10) → Bloque 3 (45) → Bloque 4 (45) → Receso (5) → Bloque 5 (45). Termina al finalizar el bloque 5. |
| **Viernes** | Bloque 1 (45) → Bloque 2 (45) → Receso (10) → Bloque 3 (45) → Bloque 4 (45) → Receso (10). No hay bloque 5. |

| Jornada | Inicio | Fin de clases lun–jue | Fin de clases viernes (fin del receso final) |
| :--- | :--- | :--- | :--- |
| **Mañana** | 09:00 | 13:00 | 12:10 (12:20) |
| **Tarde** | 14:30 | 18:30 | 17:40 (17:50) |
| **Noche** | 19:00 | 23:00 | 22:10 (22:20) |

El detalle completo de bloques y recesos se ve en **Asistencia > Ver horarios de jornadas**.

**Catálogo inicial de cursos** (`CONFIG.COURSE_CATALOG`; la jornada es un valor inicial que el Administrador puede cambiar):

| ID | Curso | Jornada inicial |
| :--- | :--- | :--- |
| `CUR-1A`, `CUR-1B` | 1° Nivel A, B | Mañana |
| `CUR-1C`, `CUR-1D` | 1° Nivel C, D | Tarde |
| `CUR-2A`, `CUR-2B` | 2° Nivel A, B | Mañana |
| `CUR-2C`, `CUR-2D` | 2° Nivel C, D | Tarde |
| `CUR-3A` | 3° Nivel A | Noche |

**Reglas de asistencia**
- Solo se permite registrar de **lunes a viernes**; sábado y domingo se rechazan.
- El curso debe estar `Activo` y tener una jornada válida.
- Si se informa `hora`, debe estar entre el inicio de la jornada y el **fin del último bloque de clase** de ese día (lun–jue: fin del bloque 5; viernes: fin del bloque 4). El receso final del viernes no amplía esa ventana.
- Si se informa `jornada`, debe coincidir con la jornada vigente del curso.
- Cambiar la jornada de un curso **solo afecta tomas futuras**: el historial conserva la jornada con que se registró.

**IDs de curso:** se conservan los IDs existentes en las hojas. `CONFIG.LEGACY_COURSE_ID_MAP` relaciona los IDs antiguos con los sugeridos (`N-101` ↔ `CUR-1A`, `N-102` ↔ `CUR-1B`, `N-103` ↔ `CUR-1C`, `N-104` ↔ `CUR-1D`, `N-105` ↔ `CUR-2A`) y todas las búsquedas aceptan ambos.

---

## 🧭 Menú "Asistencia" (Google Sheets)

| Opción | Función | Quién |
| :--- | :--- | :--- |
| Validar estructura | `validateWorkbook` | Todos (solo lectura) |
| Preparar estructura (no destructivo) | `prepareStructure` | Administrador de la planilla |
| Cambiar jornada de un curso | `promptChangeCourseJornada` | Rol `Administrador` |
| Ver horarios de jornadas | `showJornadaSchedules` | Todos (solo lectura) |
| Generar reporte de curso | `promptExportLevelReport` | Todos |
| Generar resumen semanal | `generateWeeklySummaryFromMenu` | Todos |
| Instalar disparadores automáticos | `setupSystemTriggers` | Administrador de la planilla |
| Probar bitácora de auditoría | `testAudit` | Administrador de la planilla |

---

## ⏰ Disparadores automáticos

Se instalan con **Asistencia > Instalar disparadores automáticos** (`setupSystemTriggers`):

| Función | Cuándo | Qué hace |
| :--- | :--- | :--- |
| `runDailyAttendanceDigest` | Diario, entre 23:00 y 24:00 (solo lun–vie) | Audita qué cursos activos registraron asistencia ese día. |
| `runWeeklyAttendanceSummary` | **Viernes, a las 22:40** (después del cierre de la jornada Noche) | Genera el resumen semanal y lo guarda en `Resumenes`. |
| `runWeeklyAtRiskAlertDigest` | **Viernes, a las 22:40** | Audita los alumnos con asistencia < 85%. |
| `onEdit(e)` | Trigger simple, al editar | Audita ediciones manuales en `Asistencias`, `Justificativos`, `Usuarios` y `Niveles`. |

> **Hora calculada:** `getWeeklySummaryRunTime_()` calcula la hora sumando la duración de la jornada Noche del viernes más un margen de 20 min (`WEEKLY_SUMMARY_MARGIN_MINUTES`). Con el inicio en 19:00, el resultado es 22:40.

---

## 🔌 Integración con AppSheet (webhook)

`Webhook.gs` expone `doPost(e)`. Eventos soportados:

| Evento | Roles permitidos |
| :--- | :--- |
| `ASISTENCIA_REGISTRAR` | Administrador, Docente, Inspector |
| `ASISTENCIA_ACTUALIZAR` | Administrador, Docente, Inspector |
| `CURSO_CAMBIAR_JORNADA` | Administrador |
| `JUSTIFICATIVO_SOLICITAR` | Administrador, Inspector |
| `JUSTIFICATIVO_ACTUALIZAR` | Administrador, Inspector, Directivo |

El token se guarda en las **Propiedades del script** (`WEBHOOK_TOKEN`), nunca en el código. Contrato completo, ejemplos y códigos de error en [`docs/APPSHEET_CONFIGURATION.md`](docs/APPSHEET_CONFIGURATION.md).

---

## ⚡ Requisitos Previos

- **Node.js** >= 16.x
- **Google Clasp** (`npm install -g @google/clasp`)
- Cuenta institucional de **Google Workspace / Google Cloud**
- AppSheet Core o Enterprise License (opcional para AppSheet frontend)

---

## 🚀 Puesta en marcha rápida

1. **Clonar repositorio**:
   ```bash
   git clone <repository-url>
   cd asistencia-colegio
   ```

2. **Iniciar sesión en Clasp**:
   ```bash
   clasp login
   ```

3. **Subir el código al proyecto Apps Script vinculado**:
   ```bash
   clasp push
   ```

4. **Preparar el libro** (desde el editor de Apps Script o el menú de la planilla):
   - `seedTestData()` para cargar datos de prueba (omite las pestañas que ya tengan datos), **o**
   - **Asistencia > Preparar estructura (no destructivo)** si ya tiene datos reales.

5. **Instalar disparadores**: **Asistencia > Instalar disparadores automáticos**.

6. **Webhook (si usa AppSheet)**: ejecutar `generateWebhookToken()` y desplegar como *Aplicación web*. Ver [`docs/APPSHEET_CONFIGURATION.md`](docs/APPSHEET_CONFIGURATION.md).

---

## 🧪 Pruebas

- Plan de pruebas por módulo: [`docs/TEST_PLAN.md`](docs/TEST_PLAN.md)
- Plan de verificación en Google Apps Script: [`tests/google-verification-plan.md`](tests/google-verification-plan.md)
- Casos manuales de integración: [`tests/manual-test-cases.md`](tests/manual-test-cases.md)
- Datos y payloads de prueba: [`tests/test-data.md`](tests/test-data.md)
- Prueba local del webhook sin HTTP: `testWebhookLocally()` en `Webhook.gs`.
- **Pruebas automáticas locales** (Node >= 18, sin dependencias), desde la raíz del proyecto:
  ```bash
  node --test tests/
  ```
  - `schedule.test.js` (35 casos): bloques y recesos de Mañana, Tarde y Noche (lun–jue y viernes).
  - `services.test.js` (75 casos): roles centralizados, bloqueo anidado/rollback, asignación docente-curso,
    resumen del viernes, rendimiento (lote de 40 alumnos), webhook y manifiesto.

> **Nota:** el simulador (`tests/helpers/gas-sim.js`) usa LockService estricto (no reentrante). Un bloqueo
> anidado produce `Lock timeout`. No reemplaza la verificación en Google (ver `google-verification-plan.md`).

---

## ℹ️ Notas de arquitectura

- **Roles:** `CONFIG.SERVICE_ROLES` y `CONFIG.WEBHOOK.EVENT_ROLES` comparten las mismas arrays (la misma referencia en memoria). Cambiar uno actualiza el otro.
- **Bloqueo único:** `withScriptLock_` (en `AccessService.gs`) es reentrante dentro de la misma ejecución; las funciones internas (`_`) nunca adquieren el lock. Así `JustificationService` puede reutilizar las funciones de `AttendanceService` sin anidar bloqueos.
- **`App_Transacciones` / `App_Solicitudes`:** declaradas en `Config.gs` por compatibilidad con el modo offline de AppSheet. No tienen lógica de procesamiento en el código y no deben modificarse.
- **`Configuracion`:** hoja operativa con las claves `version`, `threshold_asistencia` y `resumen_semanal_destinatarios`. Verificar con `checkConfiguracionSetup()` antes del primer uso real.

---

## 📄 Licencia y Autores

Desarrollado para la gestión académica institucional. Todos los derechos reservados.
