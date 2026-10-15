/**
 * ScheduleService.gs - Días hábiles, jornadas y ventanas horarias
 *
 * Los inicios de jornada provienen de CONFIG.SCHEDULES y la estructura de bloques/recesos de
 * CONFIG.DAY_PATTERNS. Los horarios de cada bloque y receso se calculan aquí (no hay horas de
 * término fijas). Las fechas se manejan como cadenas 'YYYY-MM-DD'; las horas como 'HH:mm' (24 h).
 */

const DAY_NAMES_ES_ = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];

/**
 * Parsea estrictamente 'YYYY-MM-DD' (rechaza fechas inexistentes como 2026-02-31).
 * @param {string} dateStr
 * @returns {Date|null} Date a medianoche local o null si es inválida.
 */
function parseISODate_(dateStr) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(dateStr === undefined || dateStr === null ? '' : dateStr).trim());
  if (!m) return null;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  const dt = new Date(y, mo - 1, d);
  if (dt.getFullYear() !== y || dt.getMonth() !== mo - 1 || dt.getDate() !== d) return null;
  return dt;
}

/**
 * @param {string} dateStr 'YYYY-MM-DD'
 * @returns {boolean} True si es lunes a viernes.
 */
function isAttendanceDay_(dateStr) {
  const d = parseISODate_(dateStr);
  return !!d && CONFIG.ATTENDANCE_RULES.ALLOWED_WEEKDAYS.indexOf(d.getDay()) !== -1;
}

/**
 * Lanza AppError si la fecha no es lunes a viernes (o es inválida).
 * @param {string} dateStr 'YYYY-MM-DD'
 */
function assertAttendanceDay_(dateStr) {
  const d = parseISODate_(dateStr);
  if (!d) {
    throw new AppError(`Fecha inválida: "${dateStr}". Se requiere YYYY-MM-DD.`, 'INVALID_DATE');
  }
  if (!isAttendanceDay_(dateStr)) {
    throw new AppError(
      `No se puede registrar asistencia el ${dateStr} (${DAY_NAMES_ES_[d.getDay()]}): solo se permite de lunes a viernes.`,
      'INVALID_DAY'
    );
  }
}

/**
 * @param {string} time 'HH:mm'
 * @returns {boolean}
 */
function isValidTimeFormat_(time) {
  return /^([01]\d|2[0-3]):[0-5]\d$/.test(String(time === undefined || time === null ? '' : time).trim());
}

/**
 * @param {string} time 'HH:mm' (previamente validado)
 * @returns {number} Minutos desde medianoche.
 */
function timeToMinutes_(time) {
  const parts = String(time).trim().split(':');
  return Number(parts[0]) * 60 + Number(parts[1]);
}

/**
 * @param {string} jornada Nombre de jornada.
 * @returns {boolean} True si existe en CONFIG.SCHEDULES.
 */
function isValidJornada_(jornada) {
  return Object.keys(CONFIG.SCHEDULES).indexOf(String(jornada === undefined || jornada === null ? '' : jornada).trim()) !== -1;
}

/**
 * Convierte minutos desde medianoche a 'HH:mm'.
 * @param {number} totalMinutes Entero entre 0 y 1439.
 * @returns {string}
 */
function minutesToTime_(totalMinutes) {
  const h = Math.floor(totalMinutes / 60);
  const m = totalMinutes % 60;
  return (h < 10 ? '0' : '') + h + ':' + (m < 10 ? '0' : '') + m;
}

/**
 * @param {string} dateStr 'YYYY-MM-DD'
 * @returns {('MON_THU'|'FRI'|null)} Tipo de día: lunes a jueves, viernes; null si es fin de semana o fecha inválida.
 */
function getDayType_(dateStr) {
  const d = parseISODate_(dateStr);
  if (!d) return null;
  const day = d.getDay();
  if (day >= 1 && day <= 4) return 'MON_THU';
  if (day === 5) return 'FRI';
  return null;
}

/**
 * Genera, de forma consecutiva, los bloques y recesos de una jornada para un tipo de día.
 * Es la ÚNICA lógica de cálculo de horarios: sirve igual para Mañana, Tarde y Noche.
 *
 * @param {string} jornada Nombre de jornada (clave de CONFIG.SCHEDULES).
 * @param {('MON_THU'|'FRI')} dayType Tipo de día.
 * @returns {{jornada:string, dayType:string, start:string, classEnd:string, end:string, blocks:number,
 *            segments:Array<{type:string, label:string, number:(number|null), minutes:number, start:string, end:string}>}|null}
 *   null si la jornada o el tipo de día no existen. `classEnd` = fin del último BLOQUE (límite de la
 *   ventana de asistencia); `end` = fin del último elemento (puede incluir un receso final, como el viernes).
 */
function buildDaySchedule_(jornada, dayType) {
  const name = String(jornada === undefined || jornada === null ? '' : jornada).trim();
  const schedule = CONFIG.SCHEDULES[name];
  const pattern = CONFIG.DAY_PATTERNS[dayType];
  if (!schedule || !pattern || !isValidTimeFormat_(schedule.start)) return null;

  let cursor = timeToMinutes_(schedule.start);
  let blockNumber = 0;
  let classEndMinutes = cursor;
  const segments = pattern.map(item => {
    const isBlock = item.type === 'BLOCK';
    if (isBlock) blockNumber++;
    const segment = {
      type: item.type,
      label: isBlock ? `Bloque ${blockNumber}` : 'Receso',
      number: isBlock ? blockNumber : null,
      minutes: item.minutes,
      start: minutesToTime_(cursor),
      end: minutesToTime_(cursor + item.minutes)
    };
    cursor += item.minutes;
    if (isBlock) classEndMinutes = cursor;
    return segment;
  });

  return {
    jornada: name,
    dayType: dayType,
    start: schedule.start,
    classEnd: minutesToTime_(classEndMinutes),
    end: minutesToTime_(cursor),
    blocks: blockNumber,
    segments: segments
  };
}

/**
 * Obtiene la ventana horaria de una jornada para una fecha (lunes-jueves o viernes).
 * La ventana va desde el inicio de la jornada hasta el fin de su último bloque de clase.
 * @param {string} jornada
 * @param {string} dateStr 'YYYY-MM-DD'
 * @returns {{start:string,end:string}|null} null si no hay horario (jornada inválida o fin de semana).
 */
function getScheduleWindow_(jornada, dateStr) {
  const dayType = getDayType_(dateStr);
  if (!dayType) return null;
  const day = buildDaySchedule_(jornada, dayType);
  return day ? { start: day.start, end: day.classEnd } : null;
}

/**
 * @param {string} jornada
 * @param {string} dateStr 'YYYY-MM-DD'
 * @param {string} time 'HH:mm'
 * @returns {boolean} True si la hora está dentro de la ventana (extremos inclusivos).
 */
function isTimeWithinJornada_(jornada, dateStr, time) {
  const win = getScheduleWindow_(jornada, dateStr);
  if (!win || !isValidTimeFormat_(time)) return false;
  const t = timeToMinutes_(time);
  return t >= timeToMinutes_(win.start) && t <= timeToMinutes_(win.end);
}

/**
 * Verifica que CONFIG.SCHEDULES y CONFIG.DAY_PATTERNS sean coherentes (formato de inicio,
 * patrones de ambos tipos de día, duraciones enteras positivas y término antes de medianoche).
 * @returns {Array<string>} Lista de problemas (vacía si todo está bien).
 */
function validateScheduleConfig_() {
  const problems = [];
  const names = Object.keys(CONFIG.SCHEDULES);

  Object.values(CONFIG.JORNADAS).forEach(j => {
    if (names.indexOf(j) === -1) problems.push(`La jornada "${j}" no tiene horario definido.`);
  });

  const dayTypes = ['MON_THU', 'FRI'];
  const patternOk = {};
  dayTypes.forEach(key => {
    const pattern = CONFIG.DAY_PATTERNS && CONFIG.DAY_PATTERNS[key];
    if (!Array.isArray(pattern) || pattern.length === 0) {
      problems.push(`Falta el patrón de bloques ${key}.`);
      return;
    }
    let valid = true;
    pattern.forEach((item, i) => {
      if (!item || (item.type !== 'BLOCK' && item.type !== 'BREAK')) {
        problems.push(`Patrón ${key}, elemento ${i + 1}: tipo inválido (debe ser BLOCK o BREAK).`);
        valid = false;
      } else if (!Number.isInteger(item.minutes) || item.minutes <= 0) {
        problems.push(`Patrón ${key}, elemento ${i + 1}: la duración debe ser un entero de minutos mayor que 0.`);
        valid = false;
      }
    });
    if (valid && !pattern.some(item => item.type === 'BLOCK')) {
      problems.push(`Patrón ${key}: debe contener al menos un bloque de clase.`);
      valid = false;
    }
    patternOk[key] = valid;
  });

  names.forEach(name => {
    const start = CONFIG.SCHEDULES[name] && CONFIG.SCHEDULES[name].start;
    if (!isValidTimeFormat_(start)) {
      problems.push(`Jornada "${name}": hora de inicio inválida (${start}).`);
      return;
    }
    dayTypes.forEach(key => {
      if (!patternOk[key]) return;
      const day = buildDaySchedule_(name, key);
      if (timeToMinutes_(day.start) + day.segments.reduce((sum, s) => sum + s.minutes, 0) >= 24 * 60) {
        problems.push(`Jornada "${name}" (${key}): el horario calculado excede las 24:00 (inicio ${day.start}).`);
      }
    });
  });

  return problems;
}

/**
 * Texto con el detalle de una jornada para un tipo de día (bloques y recesos en orden).
 * @param {string} jornada
 * @param {('MON_THU'|'FRI')} dayType
 * @returns {string}
 */
function formatDaySchedule_(jornada, dayType) {
  const day = buildDaySchedule_(jornada, dayType);
  if (!day) return `  (sin horario definido para ${jornada})`;
  const lines = day.segments.map(s => `    ${s.start} - ${s.end}  ${s.label} (${s.minutes} min)`);
  lines.push(`    Fin de clases: ${day.classEnd}` + (day.end !== day.classEnd ? ` (el receso final termina a las ${day.end})` : ''));
  return lines.join('\n');
}

/**
 * Texto con el detalle de todas las jornadas para lunes a jueves y viernes.
 * @returns {string}
 */
function formatAllJornadaSchedules_() {
  const sections = Object.keys(CONFIG.SCHEDULES).map(name => [
    `JORNADA ${name.toUpperCase()} (inicio ${CONFIG.SCHEDULES[name].start})`,
    '  Lunes a jueves:',
    formatDaySchedule_(name, 'MON_THU'),
    '  Viernes:',
    formatDaySchedule_(name, 'FRI')
  ].join('\n'));
  return sections.join('\n\n');
}

/**
 * Hora (en la zona del script) a la que deben correr el resumen semanal y la alerta de riesgo del
 * viernes: DESPUÉS del cierre real de la última jornada del viernes (fin más tardío entre jornadas,
 * contando su receso final) más CONFIG.TRIGGERS.WEEKLY_SUMMARY_MARGIN_MINUTES para escrituras tardías.
 * Con la configuración actual: Noche termina 22:20 + 20 min = 22:40.
 * @returns {{hour:number, minute:number, time:string, closesAt:string}} time/closesAt en 'HH:mm'.
 */
function getWeeklySummaryRunTime_() {
  let latestEnd = 0;
  Object.keys(CONFIG.SCHEDULES).forEach(name => {
    const day = buildDaySchedule_(name, 'FRI');
    if (day) latestEnd = Math.max(latestEnd, timeToMinutes_(day.end));
  });
  // Un disparador no puede pasar de las 23:59 del mismo día.
  const run = Math.min(latestEnd + CONFIG.TRIGGERS.WEEKLY_SUMMARY_MARGIN_MINUTES, 23 * 60 + 59);
  return {
    hour: Math.floor(run / 60),
    minute: run % 60,
    time: minutesToTime_(run),
    closesAt: minutesToTime_(latestEnd)
  };
}

/**
 * @returns {string} Hora actual 'HH:mm' en la zona horaria del script.
 */
function getCurrentTimeHHmm_() {
  return Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'HH:mm');
}

/**
 * Suma días a una fecha 'YYYY-MM-DD'.
 * @param {string} dateStr
 * @param {number} days
 * @returns {string}
 */
function addDaysISO_(dateStr, days) {
  const d = parseISODate_(dateStr);
  if (!d) throw new AppError(`Fecha inválida: "${dateStr}".`, 'INVALID_DATE');
  return formatDateISO_(new Date(d.getFullYear(), d.getMonth(), d.getDate() + days));
}

/**
 * Rango lunes-viernes de la semana que contiene la fecha dada.
 * @param {string} dateStr 'YYYY-MM-DD'
 * @returns {{start:string,end:string}}
 */
function getWeekRange_(dateStr) {
  const d = parseISODate_(dateStr);
  if (!d) throw new AppError(`Fecha inválida: "${dateStr}".`, 'INVALID_DATE');
  const diffToMonday = (d.getDay() + 6) % 7;
  const monday = new Date(d.getFullYear(), d.getMonth(), d.getDate() - diffToMonday);
  const friday = new Date(monday.getFullYear(), monday.getMonth(), monday.getDate() + 4);
  return { start: formatDateISO_(monday), end: formatDateISO_(friday) };
}

/**
 * Lista las fechas de lunes a viernes comprendidas en un rango (inclusive).
 * @param {string} startStr 'YYYY-MM-DD'
 * @param {string} endStr 'YYYY-MM-DD'
 * @returns {Array<string>}
 */
function listWeekdaysBetween_(startStr, endStr) {
  const days = [];
  let cur = startStr;
  let guard = 0;
  while (cur <= endStr && guard < 400) {
    if (isAttendanceDay_(cur)) days.push(cur);
    cur = addDaysISO_(cur, 1);
    guard++;
  }
  return days;
}
