---
name: appsheet
description: Directrices y mejores prácticas para el diseño de aplicaciones AppSheet.
---

# Habilidad: AppSheet

## Principios de Diseño
1. **Nombres de Tablas y Columnas**: Usar identificadores limpios en español acordes con el esquema de Sheets.
2. **Claves Primarias (Key Columns)**: Utilizar siempre `UNIQUEID()` para claves generadas automáticamente.
3. **Expresiones de Seguridad**:
   - `Security Filters`: Limitar la descarga de datos por usuario (`USEREMAIL() = [email]`).
   - `Editable_If`: Restringir la edición de asistencias pasadas a roles administradores.
4. **UX / Vistas**: Diseñar formularios amigables con validaciones en tiempo de ejecución (`Valid_If`).
