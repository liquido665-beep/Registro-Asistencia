import { User, Course, Student, Assignment, AttendanceRecord, Justification, AuditRecord, WeeklySummary } from '../types';

export const SEED_USERS: User[] = [
  {
    id_usuario: 'U-101',
    email: 'admin.colegio@institucion.edu',
    nombre_completo: 'Carlos Mendoza',
    rol: 'Administrador',
    estado: 'Activo'
  },
  {
    id_usuario: 'U-102',
    email: 'profesor.perez@institucion.edu',
    nombre_completo: 'Juan Pérez',
    rol: 'Docente',
    estado: 'Activo'
  },
  {
    id_usuario: 'U-103',
    email: 'profesora.gomez@institucion.edu',
    nombre_completo: 'María Gómez',
    rol: 'Docente',
    estado: 'Activo'
  },
  {
    id_usuario: 'U-104',
    email: 'director.silva@institucion.edu',
    nombre_completo: 'Roberto Silva',
    rol: 'Directivo',
    estado: 'Activo'
  },
  {
    id_usuario: 'U-105',
    email: 'inspector.ruiz@institucion.edu',
    nombre_completo: 'Ana Ruiz',
    rol: 'Inspector',
    estado: 'Activo'
  }
];

export const SEED_COURSES: Course[] = [
  {
    id_nivel: 'N-101',
    nombre_nivel: '1° Medio A (1° Nivel A)',
    grado: '1° Nivel',
    seccion: 'A',
    jornada: 'Mañana',
    estado: 'Activo',
    fecha_creacion: '2026-03-01'
  },
  {
    id_nivel: 'N-102',
    nombre_nivel: '1° Medio B (1° Nivel B)',
    grado: '1° Nivel',
    seccion: 'B',
    jornada: 'Mañana',
    estado: 'Activo',
    fecha_creacion: '2026-03-01'
  },
  {
    id_nivel: 'N-103',
    nombre_nivel: '2° Medio A (1° Nivel C)',
    grado: '2° Nivel',
    seccion: 'A',
    jornada: 'Tarde',
    estado: 'Activo',
    fecha_creacion: '2026-03-01'
  },
  {
    id_nivel: 'N-104',
    nombre_nivel: '3° Medio A (1° Nivel D)',
    grado: '3° Nivel',
    seccion: 'A',
    jornada: 'Tarde',
    estado: 'Activo',
    fecha_creacion: '2026-03-01'
  },
  {
    id_nivel: 'N-105',
    nombre_nivel: '4° Medio A (2° Nivel A)',
    grado: '4° Nivel',
    seccion: 'A',
    jornada: 'Mañana',
    estado: 'Activo',
    fecha_creacion: '2026-03-01'
  },
  {
    id_nivel: 'CUR-3A',
    nombre_nivel: '3° Nivel A (Vespertino)',
    grado: '3° Nivel',
    seccion: 'A',
    jornada: 'Noche',
    estado: 'Activo',
    fecha_creacion: '2026-03-01'
  }
];

export const SEED_STUDENTS: Student[] = [
  {
    id_estudiante: 'E-1001',
    rut_dni: '23456789-1',
    nombres: 'Lucas',
    apellidos: 'González Pérez',
    id_nivel: 'N-101',
    email_apoderado: 'apoderado.gonzalez@gmail.com'
  },
  {
    id_estudiante: 'E-1002',
    rut_dni: '23456789-2',
    nombres: 'Sofía',
    apellidos: 'Rodríguez Silva',
    id_nivel: 'N-101',
    email_apoderado: 'apoderado.rodriguez@gmail.com'
  },
  {
    id_estudiante: 'E-1003',
    rut_dni: '23456789-3',
    nombres: 'Mateo',
    apellidos: 'Fernández López',
    id_nivel: 'N-101',
    email_apoderado: 'apoderado.fernandez@gmail.com'
  },
  {
    id_estudiante: 'E-1004',
    rut_dni: '23456789-4',
    nombres: 'Valentina',
    apellidos: 'Morales Díaz',
    id_nivel: 'N-102',
    email_apoderado: 'apoderado.morales@gmail.com'
  },
  {
    id_estudiante: 'E-1005',
    rut_dni: '23456789-5',
    nombres: 'Benjamín',
    apellidos: 'Castro Torres',
    id_nivel: 'N-102',
    email_apoderado: 'apoderado.castro@gmail.com'
  },
  {
    id_estudiante: 'E-1006',
    rut_dni: '23456789-6',
    nombres: 'Camila',
    apellidos: 'Navarro Soto',
    id_nivel: 'N-101',
    email_apoderado: 'apoderado.navarro@gmail.com'
  },
  {
    id_estudiante: 'E-1007',
    rut_dni: '23456789-7',
    nombres: 'Martín',
    apellidos: 'Espinoza Vera',
    id_nivel: 'N-103',
    email_apoderado: 'apoderado.espinoza@gmail.com'
  },
  {
    id_estudiante: 'E-1008',
    rut_dni: '23456789-8',
    nombres: 'Ignacia',
    apellidos: 'Reyes Fuentes',
    id_nivel: 'N-103',
    email_apoderado: 'apoderado.reyes@gmail.com'
  },
  {
    id_estudiante: 'E-1009',
    rut_dni: '23456789-9',
    nombres: 'Joaquín',
    apellidos: 'Herrera Valdés',
    id_nivel: 'CUR-3A',
    email_apoderado: 'apoderado.herrera@gmail.com'
  }
];

export const SEED_ASSIGNMENTS: Assignment[] = [
  {
    id_asignacion: 'ASG-501',
    id_usuario: 'U-102',
    id_nivel: 'N-101',
    asignatura: 'Matemáticas',
    periodo_academico: '2026'
  },
  {
    id_asignacion: 'ASG-502',
    id_usuario: 'U-102',
    id_nivel: 'N-102',
    asignatura: 'Matemáticas',
    periodo_academico: '2026'
  },
  {
    id_asignacion: 'ASG-503',
    id_usuario: 'U-103',
    id_nivel: 'N-101',
    asignatura: 'Lenguaje y Comunicación',
    periodo_academico: '2026'
  },
  {
    id_asignacion: 'ASG-504',
    id_usuario: 'U-103',
    id_nivel: 'N-103',
    asignatura: 'Historia y Geografía',
    periodo_academico: '2026'
  }
];

export const SEED_ATTENDANCE: AttendanceRecord[] = [
  {
    id_asistencia: 'ATT-1001',
    id_estudiante: 'E-1001',
    fecha: '2026-10-12',
    estado: 'Presente',
    observacion: 'Llegada puntual',
    registrado_por: 'profesor.perez@institucion.edu',
    timestamp: '2026-10-12 09:05:00',
    jornada: 'Mañana'
  },
  {
    id_asistencia: 'ATT-1002',
    id_estudiante: 'E-1002',
    fecha: '2026-10-12',
    estado: 'Presente',
    observacion: '',
    registrado_por: 'profesor.perez@institucion.edu',
    timestamp: '2026-10-12 09:05:00',
    jornada: 'Mañana'
  },
  {
    id_asistencia: 'ATT-1003',
    id_estudiante: 'E-1003',
    fecha: '2026-10-12',
    estado: 'Ausente',
    observacion: 'Sin aviso',
    registrado_por: 'profesor.perez@institucion.edu',
    timestamp: '2026-10-12 09:05:00',
    jornada: 'Mañana'
  },
  {
    id_asistencia: 'ATT-1004',
    id_estudiante: 'E-1006',
    fecha: '2026-10-12',
    estado: 'Atrasado',
    observacion: 'Ingreso 09:20',
    registrado_por: 'inspector.ruiz@institucion.edu',
    timestamp: '2026-10-12 09:20:00',
    jornada: 'Mañana'
  },
  {
    id_asistencia: 'ATT-1005',
    id_estudiante: 'E-1001',
    fecha: '2026-10-13',
    estado: 'Presente',
    observacion: '',
    registrado_por: 'profesora.gomez@institucion.edu',
    timestamp: '2026-10-13 09:02:00',
    jornada: 'Mañana'
  },
  {
    id_asistencia: 'ATT-1006',
    id_estudiante: 'E-1002',
    fecha: '2026-10-13',
    estado: 'Presente',
    observacion: '',
    registrado_por: 'profesora.gomez@institucion.edu',
    timestamp: '2026-10-13 09:02:00',
    jornada: 'Mañana'
  },
  {
    id_asistencia: 'ATT-1007',
    id_estudiante: 'E-1003',
    fecha: '2026-10-13',
    estado: 'Ausente',
    observacion: 'Resfriado común',
    registrado_por: 'profesora.gomez@institucion.edu',
    timestamp: '2026-10-13 09:02:00',
    jornada: 'Mañana'
  },
  {
    id_asistencia: 'ATT-1008',
    id_estudiante: 'E-1007',
    fecha: '2026-10-13',
    estado: 'Presente',
    observacion: '',
    registrado_por: 'profesora.gomez@institucion.edu',
    timestamp: '2026-10-13 14:35:00',
    jornada: 'Tarde'
  },
  {
    id_asistencia: 'ATT-1009',
    id_estudiante: 'E-1008',
    fecha: '2026-10-13',
    estado: 'Justificado',
    observacion: 'Licencia médica entregada',
    registrado_por: 'inspector.ruiz@institucion.edu',
    timestamp: '2026-10-13 14:40:00',
    jornada: 'Tarde'
  }
];

export const SEED_JUSTIFICATIONS: Justification[] = [
  {
    id_justificativo: 'JUST-701',
    id_estudiante: 'E-1008',
    fecha_inicio: '2026-10-13',
    fecha_fin: '2026-10-14',
    tipo: 'Médico',
    motivo: 'Cuadro respiratorio agudo certificado por pediatra',
    url_archivo_drive: 'https://drive.google.com/file/d/justificativo-ejemplo-medico',
    estado_aprobacion: 'Aprobado',
    registrado_por: 'inspector.ruiz@institucion.edu',
    aprobado_por: 'director.silva@institucion.edu',
    timestamp: '2026-10-13 10:15:00'
  },
  {
    id_justificativo: 'JUST-702',
    id_estudiante: 'E-1003',
    fecha_inicio: '2026-10-12',
    fecha_fin: '2026-10-13',
    tipo: 'Personal',
    motivo: 'Trámite familiar impostergable fuera de la región',
    url_archivo_drive: 'https://drive.google.com/file/d/justificativo-ejemplo-personal',
    estado_aprobacion: 'Pendiente',
    registrado_por: 'inspector.ruiz@institucion.edu',
    timestamp: '2026-10-13 11:30:00'
  }
];

export const SEED_AUDIT: AuditRecord[] = [
  {
    id_evento: 'EVT-001',
    timestamp: '2026-10-12 09:05:00',
    usuario: 'profesor.perez@institucion.edu',
    accion: 'REGISTRO_MASIVO_ASISTENCIA',
    tabla_afectada: 'Asistencias',
    id_registro: 'N-101',
    detalle: 'Registro de asistencia para 1° Medio A fecha 2026-10-12 (3 alumnos: 2 Presentes, 1 Ausente)'
  },
  {
    id_evento: 'EVT-002',
    timestamp: '2026-10-13 10:15:00',
    usuario: 'inspector.ruiz@institucion.edu',
    accion: 'CREAR_JUSTIFICATIVO',
    tabla_afectada: 'Justificativos',
    id_registro: 'JUST-701',
    detalle: 'Ingreso de justificativo médico para estudiante E-1008 por 2 días'
  },
  {
    id_evento: 'EVT-003',
    timestamp: '2026-10-13 11:00:00',
    usuario: 'director.silva@institucion.edu',
    accion: 'APROBAR_JUSTIFICATIVO',
    tabla_afectada: 'Justificativos',
    id_registro: 'JUST-701',
    detalle: 'Aprobación de justificativo médico JUST-701 y actualización automática de asistencia a Justificado'
  }
];

export const SEED_SUMMARIES: WeeklySummary[] = [
  {
    id_resumen: 'SUM-2026-W41',
    clave: 'RES-W41-2026',
    semana_inicio: '2026-10-05',
    semana_fin: '2026-10-09',
    alcance: 'Institucional Completo',
    generado_por: 'admin.colegio@institucion.edu',
    timestamp: '2026-10-09 22:40:00',
    total_registros: 45,
    porcentaje_asistencia: 91.1,
    alumnos_con_ausencias: 3,
    destinatarios: 'direccion@institucion.edu, inspectoria@institucion.edu',
    detalle_json: JSON.stringify({
      por_jornada: {
        'Mañana': { total: 25, asistencia_pct: 92.0 },
        'Tarde': { total: 15, asistencia_pct: 90.0 },
        'Noche': { total: 5, asistencia_pct: 88.0 }
      }
    })
  }
];
