export type Role = 'Administrador' | 'Docente' | 'Directivo' | 'Inspector';

export type AttendanceStatus = 'Presente' | 'Ausente' | 'Atrasado' | 'Justificado';

export type Jornada = 'Mañana' | 'Tarde' | 'Noche';

export type JustificationType = 'Médico' | 'Personal' | 'Gendarmería' | 'Otros';

export type ApprovalStatus = 'Pendiente' | 'Aprobado' | 'Rechazado';

export interface User {
  id_usuario: string;
  email: string;
  nombre_completo: string;
  rol: Role;
  estado: 'Activo' | 'Inactivo';
}

export interface Course {
  id_nivel: string; // e.g. CUR-1A or N-101
  nombre_nivel: string;
  grado: number | string;
  seccion: string;
  jornada: Jornada;
  estado: 'Activo' | 'Inactivo';
  fecha_creacion: string;
  fecha_modificacion?: string;
}

export interface Student {
  id_estudiante: string;
  rut_dni: string;
  nombres: string;
  apellidos: string;
  id_nivel: string;
  email_apoderado: string;
}

export interface Assignment {
  id_asignacion: string;
  id_usuario: string;
  id_nivel: string;
  asignatura: string;
  periodo_academico: string;
}

export interface AttendanceRecord {
  id_asistencia: string;
  id_estudiante: string;
  fecha: string; // YYYY-MM-DD
  estado: AttendanceStatus;
  observacion: string;
  registrado_por: string; // email of user
  timestamp: string;
  jornada: Jornada;
}

export interface Justification {
  id_justificativo: string;
  id_estudiante: string;
  fecha_inicio: string; // YYYY-MM-DD
  fecha_fin: string; // YYYY-MM-DD
  tipo: JustificationType;
  motivo: string;
  url_archivo_drive: string;
  estado_aprobacion: ApprovalStatus;
  registrado_por: string;
  aprobado_por?: string;
  timestamp: string;
}

export interface AuditRecord {
  id_evento: string;
  timestamp: string;
  usuario: string;
  accion: string;
  tabla_afectada: string;
  id_registro: string;
  detalle: string;
}

export interface WeeklySummary {
  id_resumen: string;
  clave: string;
  semana_inicio: string;
  semana_fin: string;
  alcance: string;
  generado_por: string;
  timestamp: string;
  total_registros: number;
  porcentaje_asistencia: number;
  alumnos_con_ausencias: number;
  destinatarios: string;
  detalle_json: string;
}

export interface ScheduleBlock {
  type: 'BLOCK' | 'BREAK';
  label: string;
  number?: number;
  minutes: number;
  startTime: string; // HH:mm
  endTime: string;   // HH:mm
}
