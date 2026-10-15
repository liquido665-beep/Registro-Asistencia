import { Jornada, ScheduleBlock } from '../types';
import { CONFIG } from '../constants/config';

function parseMinutes(timeStr: string): number {
  const [h, m] = timeStr.split(':').map(Number);
  return h * 60 + m;
}

function formatMinutes(totalMin: number): string {
  const h = Math.floor(totalMin / 60) % 24;
  const m = totalMin % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

export function buildDaySchedule(jornada: Jornada, isFriday: boolean): ScheduleBlock[] {
  const startStr = CONFIG.SCHEDULES[jornada]?.start || '09:00';
  const pattern = isFriday ? CONFIG.DAY_PATTERNS.FRI : CONFIG.DAY_PATTERNS.MON_THU;
  
  let currentMin = parseMinutes(startStr);
  let blockIndex = 1;
  const schedule: ScheduleBlock[] = [];

  for (const item of pattern) {
    const start = formatMinutes(currentMin);
    const end = formatMinutes(currentMin + item.minutes);
    if (item.type === 'BLOCK') {
      schedule.push({
        type: 'BLOCK',
        number: blockIndex,
        label: `Bloque ${blockIndex}`,
        minutes: item.minutes,
        startTime: start,
        endTime: end
      });
      blockIndex++;
    } else {
      schedule.push({
        type: 'BREAK',
        label: `Receso (${item.minutes} min)`,
        minutes: item.minutes,
        startTime: start,
        endTime: end
      });
    }
    currentMin += item.minutes;
  }

  return schedule;
}

export function getJornadaClassHours(jornada: Jornada, isFriday: boolean): { start: string; classEnd: string; shiftEnd: string } {
  const schedule = buildDaySchedule(jornada, isFriday);
  const blocks = schedule.filter(s => s.type === 'BLOCK');
  const lastBlock = blocks[blocks.length - 1];
  const lastItem = schedule[schedule.length - 1];

  return {
    start: schedule[0]?.startTime || '09:00',
    classEnd: lastBlock?.endTime || '13:00',
    shiftEnd: lastItem?.endTime || '13:00'
  };
}

export function isWeekdayAllowed(dateStr: string): { allowed: boolean; dayName: string; isFriday: boolean } {
  // Parse date safely ignoring local time skew: YYYY-MM-DD
  const parts = dateStr.split('-').map(Number);
  const dateObj = new Date(parts[0], parts[1] - 1, parts[2]);
  const day = dateObj.getDay(); // 0=domingo, 1=lunes, ..., 5=viernes, 6=sábado

  const dayNames = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
  const allowed = CONFIG.ATTENDANCE_RULES.ALLOWED_WEEKDAYS.includes(day);
  const isFriday = day === 5;

  return {
    allowed,
    dayName: dayNames[day],
    isFriday
  };
}

export function getWeeklySummaryRunTime(nightStart = '19:00'): string {
  // Friday night shift calculation
  let cur = parseMinutes(nightStart);
  for (const item of CONFIG.DAY_PATTERNS.FRI) {
    cur += item.minutes;
  }
  // add margin
  cur += CONFIG.TRIGGERS.WEEKLY_SUMMARY_MARGIN_MINUTES;
  return formatMinutes(cur);
}
