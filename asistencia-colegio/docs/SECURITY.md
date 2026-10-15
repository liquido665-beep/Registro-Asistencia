# 🛡️ Seguridad y Gobierno de Datos - Asistencia Colegio

## 1. Política de Acceso y Roles (RBAC)

| Rol | Acceso a Hojas | Permiso AppSheet | Acceso a Drive |
| :--- | :--- | :--- | :--- |
| **Administrador** | Total (Lectura/Escritura) | All Tables (Full Access) | Propietario / Administrador |
| **Directivo** | Lectura Total / Reportes | Read-Only Dashboards | Lectura de reportes |
| **Docente** | Lectura Alumnos / Escritura Asistencia | Asistencia (Add/Edit hoy) | Sin acceso directo |
| **Inspector** | Lectura Alumnos / Escritura Justificativos | Justificativos (Add/Edit) | Subida a carpetas |

---

## 2. Inmutabilidad y Auditoría
1. **Hoja de Auditoría (`Auditoria`)**:
   - Solo modificable mediante la función interna `writeAudit_()`.
   - Protección de pestaña en Google Sheets para evitar borrado manual de filas por usuarios no administradores.
2. **Logs del Sistema**:
   - Redireccionados a Google Cloud Stackdriver Logging mediante `exceptionLogging: "STACKDRIVER"`.

---

## 3. Protección de Datos Personales (PII)
- Los datos de los estudiantes (RUT, Nombres, Apoderados) se almacenan exclusivamente dentro del dominio Google Workspace de la institución.
- Queda estrictamente prohibida la exportación de CSVs a dispositivos personales no gestionados.
- Las URLs de justificativos en Google Drive están restringidas a usuarios con dominio institucional habilitado.
