---
name: security
description: Normas de seguridad, privacidad y auditoría para Google Workspace.
---

# Habilidad: Seguridad y Gobierno

## Principios Fundamentales
1. **Principio de Menor Privilegio**: Restringir accesos a nivel de hoja y carpeta de Drive.
2. **Protección PII**: Garantizar que ningún dato sensible de estudiantes o apoderados sea expuesto públicamente.
3. **No Hardcoding**: Nunca hardcodear credenciales, tokens o IDs de usuarios en el código fuente. Usar `Config.gs` o `PropertiesService`.
4. **Auditoría Obligatoria**: Todo cambio destructivo o de escritura debe dejar huella en la bitácora inalterable.
