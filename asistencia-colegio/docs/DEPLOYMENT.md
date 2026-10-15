# 🚀 Guía de Despliegue: `Asistencia Colegio`

Instrucciones paso a paso para desplegar el proyecto con **Google Clasp**, **Google Apps Script** y **AppSheet**.

> **Regla:** no hay despliegue automático. Cada paso requiere intervención manual y verificación antes de continuar.

---

## 1. ⚙️ Requisitos Previos

- **Node.js** >= 16.x
- **Google Clasp** instalado globalmente:
  ```bash
  npm install -g @google/clasp
  ```
- Cuenta de Administrador de **Google Workspace** de la institución.
- Licencia **AppSheet** Core o Enterprise.

---

## 2. 🔐 Autenticación en Clasp

```bash
clasp login
```

Completa el flujo OAuth en el navegador con la cuenta institucional.

---

## 3. 📤 Subir el código (`clasp push`)

```bash
clasp push
```

`clasp` usa `rootDir: "src"` (`.clasp.json`). Solo sube los archivos de `src/`; los directorios `tests/`, `docs/` y `data/` no se suben.

> **Manifest:** `src/appsscript.json` es la **única** fuente de verdad. El archivo `appsscript.json` de la raíz fue eliminado; no lo recrees.

Verificar el código en el editor de Apps Script:
```bash
clasp open
```

---

## 4. 🔑 Scopes de OAuth (`src/appsscript.json`)

| Scope | Para qué |
| :--- | :--- |
| `auth/spreadsheets` | Leer y escribir la planilla. |
| `auth/drive` | Crear carpetas y archivos de justificativos en Drive. |
| `auth/script.scriptapp` | Crear y eliminar disparadores automáticos. |
| `auth/script.send_mail` | Enviar el resumen semanal por correo. |
| `auth/script.container.ui` | Menú contextual en Google Sheets. |
| `auth/userinfo.email` | Identificar al usuario activo (roles). |

---

## 5. 🌐 Despliegue como Aplicación Web (webhook para AppSheet)

El endpoint `doPost` necesita estar disponible como **Web App**:

1. En el editor de Apps Script: **Implementar → Nueva implementación**.
2. Tipo: **Aplicación web**.
3. Configurar:
   - **Ejecutar como:** `Usuario que implementa la aplicación` (`USER_DEPLOYING`).
   - **Quién tiene acceso:** `Cualquiera` (`ANYONE_ANONYMOUS`).
4. Presionar **Implementar** y copiar la URL `/exec`.

> **¿Por qué `ANYONE_ANONYMOUS`?** AppSheet llama al webhook sin credenciales Google. El token
> (`WEBHOOK_TOKEN`) es el mecanismo real de autenticación. Usar `MYSELF` o `DOMAIN` rompería
> la integración con AppSheet.

> **Cada `clasp push` requiere una nueva versión** para que el endpoint `/exec` sirva el código actualizado.
> Ve a **Implementar → Administrar implementaciones → Editar → Nueva versión**.

---

## 6. 🔑 Generar el token del webhook

Una vez desplegado como Web App, ejecutar desde el editor o la consola:

```javascript
generateWebhookToken();
```

El token se guarda en las **Propiedades del script** bajo la clave `WEBHOOK_TOKEN`. Copiarlo a la configuración de la acción en AppSheet.

---

## 7. 📋 Preparar la estructura del libro

Desde el editor de Apps Script o el menú de la planilla, ejecutar una de las siguientes opciones:

- `seedTestData()` — carga datos de prueba (no destructivo, omite pestañas con datos).
- **Asistencia → Preparar estructura (no destructivo)** — si ya tiene datos reales.

Para verificar que `Configuracion` quedó bien:

```javascript
checkConfiguracionSetup();
// Debe retornar: { ok: true, problems: [], sheetChecked: true }
```

---

## 8. ⏰ Instalar disparadores automáticos

Desde el menú: **Asistencia → Instalar disparadores automáticos** (`setupSystemTriggers`).

Esto instala:

| Función | Cuándo |
| :--- | :--- |
| `runDailyAttendanceDigest` | Todos los días, entre 23:00 y 24:00 |
| `runWeeklyAttendanceSummary` | Viernes, a las **22:40** (después del cierre de la jornada Noche) |
| `runWeeklyAtRiskAlertDigest` | Viernes, a las **22:40** |

> **Nota sobre el horario del viernes:** la hora se calcula automáticamente con `getWeeklySummaryRunTime_()`.
> Con la jornada Noche iniciando a las 19:00 y el margen de 20 min, el resultado es 22:40.

---

## 9. 📱 Configurar AppSheet

1. Inicia sesión en [AppSheet.com](https://www.appsheet.com) con la cuenta de Google Workspace.
2. **Create → App → Start with existing data → Google Sheets**.
3. Seleccionar el libro `Asistencia Colegio`.
4. Configurar tablas, Slices, Vistas y Acciones según [`docs/APPSHEET_CONFIGURATION.md`](APPSHEET_CONFIGURATION.md).
5. **Security → Require User Sign-In**: activar, restringir al dominio institucional.
6. En la acción que registra asistencia: configurar la URL del webhook (`/exec`) y el token.
7. **Manage → Deploy State → Move app to Deployed state**.

---

## 10. ✅ Lista de Chequeo Post-Despliegue

- [ ] `checkConfiguracionSetup()` retorna `{ ok: true }`.
- [ ] **Asistencia → Validar estructura** reporta éxito (11 pestañas).
- [ ] `generateWebhookToken()` ejecutado; `WEBHOOK_TOKEN` en Propiedades del script.
- [ ] Prueba del webhook con `curl` o `testWebhookLocally()`: responde `status: success`.
- [ ] Disparadores instalados (3 temporales + 1 `onEdit`).
- [ ] Primera toma de asistencia de prueba: aparece en `Asistencias` y en `Auditoria`.
- [ ] Resumen semanal generado manualmente: aparece en `Resumenes`.
- [ ] Confirmación de modo offline en AppSheet (dispositivo móvil).
