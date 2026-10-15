/**
 * Simulador mínimo de Google Apps Script para pruebas locales (sin dependencias).
 *
 * Carga los archivos REALES de src/ en un contexto aislado y reemplaza los servicios de Google por
 * versiones en memoria. Está fuera de src/ (clasp rootDir = "src"), por lo que no se sube a Apps Script.
 *
 * Detalles pensados para detectar defectos reales:
 *  - LockService es ESTRICTO: no es reentrante. Adquirir un bloqueo ya tomado lanza "Lock timeout" y
 *    liberar uno que no está tomado se cuenta como liberación prematura. Así un bloqueo anidado falla.
 *  - Se cuentan lecturas de DATOS (getValues desde la fila 2) y escrituras por hoja para medir
 *    rendimiento, y se puede inyectar un fallo de escritura para probar el rollback.
 *
 * LIMITACIÓN: es una simulación; no reemplaza las pruebas en Google (ver tests/google-verification-plan.md).
 */
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const SRC = path.join(__dirname, '..', '..', 'src');

// Orden de carga: Config primero (SERVICE_ROLES_ lo usa CONFIG).
const SOURCE_FILES = [
  'Config.gs', 'AccessService.gs', 'SheetService.gs', 'AuditService.gs', 'ScheduleService.gs',
  'CourseService.gs', 'SchemaService.gs', 'AttendanceService.gs', 'JustificationService.gs',
  'ReportService.gs', 'SummaryService.gs', 'ValidationService.gs', 'Triggers.gs', 'Seed.gs',
  'Webhook.gs', 'Main.gs'
];

const isEmpty = v => v === '' || v === null || v === undefined;

class FakeRange {
  constructor(sheet, row, col, numRows, numCols) {
    this.sheet = sheet;
    this.row = row;
    this.col = col;
    this.numRows = numRows;
    this.numCols = numCols;
  }

  getValues() {
    if (this.row >= 2) {
      const reads = this.sheet.env.stats.reads;
      reads[this.sheet.name] = (reads[this.sheet.name] || 0) + 1;
    }
    const out = [];
    for (let r = 0; r < this.numRows; r++) {
      const line = [];
      for (let c = 0; c < this.numCols; c++) {
        const v = (this.sheet.rows[this.row - 1 + r] || [])[this.col - 1 + c];
        line.push(v === undefined ? '' : v);
      }
      out.push(line);
    }
    return out;
  }

  setValues(values) {
    this.sheet.checkInjectedFailure();
    const writes = this.sheet.env.stats.writes;
    writes[this.sheet.name] = (writes[this.sheet.name] || 0) + 1;
    values.forEach((line, r) => {
      const target = this.row - 1 + r;
      this.sheet.rows[target] = this.sheet.rows[target] || [];
      line.forEach((v, c) => { this.sheet.rows[target][this.col - 1 + c] = v; });
    });
    return this;
  }

  setValue(v) { return this.setValues([[v]]); }
}
['setFontWeight', 'setBackground', 'setFontColor', 'setFontStyle', 'setFontSize', 'setHorizontalAlignment', 'merge']
  .forEach(name => { FakeRange.prototype[name] = function () { return this; }; });

class FakeSheet {
  constructor(env, name) {
    this.env = env;
    this.name = name;
    this.rows = [];
    this.maxRows = 1000;
  }
  getName() { return this.name; }
  getMaxRows() { return this.maxRows; }
  insertRowsAfter(after, n) { this.maxRows += n; }
  getLastRow() {
    for (let i = this.rows.length - 1; i >= 0; i--) {
      if ((this.rows[i] || []).some(v => !isEmpty(v))) return i + 1;
    }
    return 0;
  }
  getLastColumn() {
    let max = 0;
    this.rows.forEach(r => {
      (r || []).forEach((v, j) => { if (!isEmpty(v)) max = Math.max(max, j + 1); });
    });
    return max;
  }
  getRange(row, col, numRows, numCols) {
    if (typeof row === 'string') throw new Error('El simulador no soporta rangos A1: ' + row);
    return new FakeRange(this, row, col, numRows || 1, numCols || 1);
  }
  appendRow(values) {
    this.checkInjectedFailure();
    const writes = this.env.stats.writes;
    writes[this.name] = (writes[this.name] || 0) + 1;
    this.rows[this.getLastRow()] = values.slice();
  }
  deleteRows(start, count) { this.rows.splice(start - 1, count); }
  autoResizeColumns() {}
  clear() { this.rows = []; }

  checkInjectedFailure() {
    const f = this.env.failOn;
    if (!f || f.sheet !== this.name) return;
    if (f.after > 0) { f.after--; return; }
    this.env.failOn = null; // falla una sola vez
    throw new Error('Fallo simulado de escritura en ' + this.name);
  }
}

/**
 * @param {Object} [options]
 * @param {Object<string,function(string):string>} [options.patches] Reemplazos de texto por archivo.
 * @returns {Object} Entorno de pruebas.
 */
function createEnv(options) {
  const patches = (options && options.patches) || {};
  const env = {
    sheets: new Map(),
    activeEmail: 'francisco.info@cepatagonia.cl',
    stats: { reads: {}, writes: {} },
    lock: { held: false, acquisitions: 0, timeouts: 0, badReleases: 0, releases: 0 },
    failOn: null,
    mails: [],
    triggers: [],
    props: {},
    uuid: 0
  };

  const spreadsheet = {
    getSheetByName: name => env.sheets.get(String(name)) || null,
    insertSheet: name => {
      const sheet = new FakeSheet(env, name);
      env.sheets.set(name, sheet);
      return sheet;
    },
    getSheets: () => Array.from(env.sheets.values())
  };

  const lockObj = {
    waitLock() {
      env.lock.acquisitions++;
      if (env.lock.held) {
        env.lock.timeouts++;
        throw new Error('Exception: Lock timeout (el bloqueo ya estaba tomado)');
      }
      env.lock.held = true;
    },
    releaseLock() {
      if (!env.lock.held) env.lock.badReleases++;
      env.lock.held = false;
      env.lock.releases++;
    }
  };

  const cache = {};
  const globals = {
    Logger: { log() {} },
    SpreadsheetApp: {
      getActiveSpreadsheet: () => spreadsheet,
      getUi: () => { throw new Error('UI no disponible en pruebas'); },
      flush() {}
    },
    LockService: { getScriptLock: () => lockObj },
    Utilities: {
      getUuid: () => 'uuid-' + (++env.uuid),
      formatDate: (d, tz, fmt) => {
        const p = n => String(n).padStart(2, '0');
        return fmt.replace('yyyy', d.getFullYear()).replace('MM', p(d.getMonth() + 1))
          .replace('dd', p(d.getDate())).replace('HH', p(d.getHours())).replace('mm', p(d.getMinutes()));
      }
    },
    Session: {
      getScriptTimeZone: () => 'America/Santiago',
      getActiveUser: () => ({ getEmail: () => env.activeEmail })
    },
    MailApp: { sendEmail: msg => { env.mails.push(msg); } },
    CacheService: {
      getScriptCache: () => ({ get: k => (k in cache ? cache[k] : null), put: (k, v) => { cache[k] = v; } })
    },
    PropertiesService: {
      getScriptProperties: () => ({
        getProperty: k => (k in env.props ? env.props[k] : null),
        setProperty: (k, v) => { env.props[k] = v; }
      })
    },
    ContentService: {
      MimeType: { JSON: 'JSON' },
      createTextOutput: text => ({ text: text, setMimeType() { return this; }, getContent() { return this.text; } })
    },
    ScriptApp: {
      WeekDay: { FRIDAY: 'FRIDAY' },
      getProjectTriggers: () => env.triggers,
      deleteTrigger: t => { env.triggers = env.triggers.filter(x => x !== t); },
      newTrigger: handler => {
        const t = { handler: handler, getHandlerFunction() { return handler; } };
        const builder = {
          timeBased() { return builder; },
          everyDays() { t.everyDays = true; return builder; },
          onWeekDay(d) { t.weekDay = d; return builder; },
          atHour(h) { t.hour = h; return builder; },
          nearMinute(m) { t.minute = m; return builder; },
          create() { env.triggers.push(t); return t; }
        };
        return builder;
      }
    }
  };

  const ctx = vm.createContext(globals);
  SOURCE_FILES.forEach(file => {
    let code = fs.readFileSync(path.join(SRC, file), 'utf8');
    if (patches[file]) code = patches[file](code);
    vm.runInContext(code, ctx, { filename: file });
  });

  env.ctx = ctx;
  env.run = expr => vm.runInContext(expr, ctx);
  env.json = value => JSON.parse(JSON.stringify(value));
  env.call = (name, ...args) => {
    ctx.__args = args;
    return vm.runInContext(`${name}(...__args)`, ctx);
  };
  /** Ejecuta fn y devuelve { ok, value } o { ok:false, code, message } (los errores vienen de otro contexto). */
  env.attempt = fn => {
    try {
      return { ok: true, value: fn() };
    } catch (e) {
      return { ok: false, code: e.code, message: e.message };
    }
  };

  /** Filas de una hoja como objetos (claves = encabezados en minúsculas), sin contar lecturas. */
  env.rows = sheetName => {
    const sheet = env.sheets.get(sheetName);
    if (!sheet || sheet.getLastRow() < 2) return [];
    const headers = (sheet.rows[0] || []).map(h => String(h).trim().toLowerCase());
    const out = [];
    for (let i = 1; i < sheet.getLastRow(); i++) {
      const obj = { _row: i + 1 };
      headers.forEach((h, j) => { obj[h] = (sheet.rows[i] || [])[j]; });
      out.push(obj);
    }
    return out;
  };
  /** Agrega una fila (por encabezado) sin pasar por la lógica del sistema ni contar estadísticas. */
  env.append = (sheetName, obj) => {
    const sheet = env.sheets.get(sheetName);
    const headers = (sheet.rows[0] || []).map(h => String(h).trim().toLowerCase());
    sheet.rows[sheet.getLastRow()] = headers.map(h => (obj[h] === undefined ? '' : obj[h]));
  };
  /** Modifica celdas de una fila existente (por encabezado), sin contar estadísticas. */
  env.patchRow = (sheetName, rowNumber, obj) => {
    const sheet = env.sheets.get(sheetName);
    const headers = (sheet.rows[0] || []).map(h => String(h).trim().toLowerCase());
    Object.keys(obj).forEach(k => { sheet.rows[rowNumber - 1][headers.indexOf(k)] = obj[k]; });
  };
  env.resetStats = () => {
    env.stats = { reads: {}, writes: {} };
    env.lock = Object.assign(env.lock, { acquisitions: 0, timeouts: 0, badReleases: 0, releases: 0 });
  };
  return env;
}

/**
 * Libro listo para usar: ejecuta el seedTestData() REAL y agrega usuarios y alumnos para los casos:
 *  U-001 Administrador, U-002 Docente (CUR-1A y CUR-1B), U-003 Inspector,
 *  U-004 Directivo, U-005 Docente SIN asignaciones, U-006 Docente Inactivo.
 *  E-1001..E-1003 CUR-1A, E-1004/E-1005 CUR-1B, E-2001 CUR-1C (Tarde), E-3001 CUR-3A (Noche).
 */
function createSeededEnv(options) {
  const env = createEnv(options);
  env.call('seedTestData');
  env.append('Usuarios', { id_usuario: 'U-004', email: 'directivo.rojas@cepatagonia.cl', nombre_completo: 'Rosa Rojas', rol: 'Directivo', estado: 'Activo' });
  env.append('Usuarios', { id_usuario: 'U-005', email: 'docente.silva@cepatagonia.cl', nombre_completo: 'Sara Silva', rol: 'Docente', estado: 'Activo' });
  env.append('Usuarios', { id_usuario: 'U-006', email: 'docente.inactivo@cepatagonia.cl', nombre_completo: 'Ines Inactiva', rol: 'Docente', estado: 'Inactivo' });
  env.append('Estudiantes', { id_estudiante: 'E-2001', rut_dni: '23456789-6', nombres: 'Diego', apellidos: 'Tarde Uno', id_nivel: 'CUR-1C', email_apoderado: 'a@x.cl' });
  env.append('Estudiantes', { id_estudiante: 'E-3001', rut_dni: '23456789-7', nombres: 'Nora', apellidos: 'Noche Uno', id_nivel: 'CUR-3A', email_apoderado: 'b@x.cl' });
  env.resetStats();
  return env;
}

module.exports = { createEnv, createSeededEnv, SRC, SOURCE_FILES };
