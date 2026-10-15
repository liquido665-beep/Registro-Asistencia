---
name: apps-script
description: Buenas prácticas y estándares de desarrollo para Google Apps Script en V8.
---

# Habilidad: Google Apps Script

## Reglas de Desarrollo
1. **Motor V8**: Usar sintaxis ES6+ (`const`, `let`, `arrow functions`, `template literals`, `promises`).
2. **Modularidad**: Separar responsabilidades por servicios (`*Service.gs`).
3. **Manejo de Errores**: Todo llamado a APIs externas o manipulaciones de hojas debe incluir bloques `try/catch`.
4. **Rendimiento**: Evitar llamadas repetidas a `getValue()` / `setValue()` dentro de loops. Usar `getValues()` y `setValues()` en lote (*batch processing*).
5. **Auditoría**: Invocar `writeAudit_()` tras operaciones de modificación de datos.
