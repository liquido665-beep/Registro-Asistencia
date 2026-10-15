import { Jornada } from '../types';

export const CONFIG = {
  APP_NAME: 'Sistema de Asistencia Escolar',
  ROLES: {
    ADMIN: 'Administrador' as const,
    TEACHER: 'Docente' as const,
    DIRECTIVE: 'Directivo' as const,
    INSPECTOR: 'Inspector' as const
  },
  JORNADAS: {
    MORNING: 'Mañana' as Jornada,
    AFTERNOON: 'Tarde' as Jornada,
    NIGHT: 'Noche' as Jornada
  },
  SCHEDULES: {
    'Mañana': { start: '09:00' },
    'Tarde':  { start: '14:30' },
    'Noche':  { start: '19:00' }
  },
  DAY_PATTERNS: {
    MON_THU: [
      { type: 'BLOCK', minutes: 45 },
      { type: 'BLOCK', minutes: 45 },
      { type: 'BREAK', minutes: 10 },
      { type: 'BLOCK', minutes: 45 },
      { type: 'BLOCK', minutes: 45 },
      { type: 'BREAK', minutes: 5 },
      { type: 'BLOCK', minutes: 45 }
    ] as const,
    FRI: [
      { type: 'BLOCK', minutes: 45 },
      { type: 'BLOCK', minutes: 45 },
      { type: 'BREAK', minutes: 10 },
      { type: 'BLOCK', minutes: 45 },
      { type: 'BLOCK', minutes: 45 },
      { type: 'BREAK', minutes: 10 }
    ] as const
  },
  ATTENDANCE_RULES: {
    ALLOWED_WEEKDAYS: [1, 2, 3, 4, 5], // 1=Mon ... 5=Fri
  },
  REPORTS: {
    CRITICAL_THRESHOLD_PERCENT: 85.0
  },
  TRIGGERS: {
    WEEKLY_SUMMARY_MARGIN_MINUTES: 20
  },
  LEGACY_COURSE_ID_MAP: {
    'N-101': 'CUR-1A',
    'N-102': 'CUR-1B',
    'N-103': 'CUR-1C',
    'N-104': 'CUR-1D',
    'N-105': 'CUR-2A'
  } as Record<string, string>
};
