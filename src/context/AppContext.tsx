import React, { createContext, useContext, useState, useEffect } from 'react';
import {
  User,
  Course,
  Student,
  Assignment,
  AttendanceRecord,
  Justification,
  AuditRecord,
  WeeklySummary,
  AttendanceStatus,
  Jornada,
  JustificationType
} from '../types';
import {
  SEED_USERS,
  SEED_COURSES,
  SEED_STUDENTS,
  SEED_ASSIGNMENTS,
  SEED_ATTENDANCE,
  SEED_JUSTIFICATIONS,
  SEED_AUDIT,
  SEED_SUMMARIES
} from '../data/seedData';
import { isWeekdayAllowed } from '../services/scheduleService';

interface AppContextType {
  currentUser: User;
  setCurrentUser: (user: User) => void;
  users: User[];
  courses: Course[];
  students: Student[];
  assignments: Assignment[];
  attendance: AttendanceRecord[];
  justifications: Justification[];
  auditLog: AuditRecord[];
  summaries: WeeklySummary[];
  
  // Actions
  recordBulkAttendance: (
    courseId: string,
    dateStr: string,
    records: { studentId: string; status: AttendanceStatus; observation: string }[]
  ) => { success: boolean; message: string; count?: number };

  changeCourseJornada: (
    courseId: string,
    newJornada: Jornada,
    reason: string
  ) => { success: boolean; message: string };

  createJustification: (params: {
    studentId: string;
    startDate: string;
    endDate: string;
    tipo: JustificationType;
    motivo: string;
    fileUrl?: string;
  }) => { success: boolean; message: string };

  approveJustification: (
    justificationId: string,
    notes?: string
  ) => { success: boolean; message: string };

  rejectJustification: (
    justificationId: string,
    notes?: string
  ) => { success: boolean; message: string };

  generateWeeklySummary: (
    weekStart: string,
    weekEnd: string,
    recipients?: string
  ) => { success: boolean; summary?: WeeklySummary; message: string };

  resetToDefaults: () => void;
  canRecordAttendanceForCourse: (courseId: string) => boolean;
}

const AppContext = createContext<AppContextType | undefined>(undefined);

const STORAGE_KEYS = {
  CURRENT_USER: 'asistencia_curr_user',
  COURSES: 'asistencia_courses',
  STUDENTS: 'asistencia_students',
  ASSIGNMENTS: 'asistencia_assignments',
  ATTENDANCE: 'asistencia_records',
  JUSTIFICATIONS: 'asistencia_justifications',
  AUDIT: 'asistencia_audit',
  SUMMARIES: 'asistencia_summaries'
};

export const AppProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [users] = useState<User[]>(SEED_USERS);

  const [currentUser, setCurrentUser] = useState<User>(() => {
    const saved = localStorage.getItem(STORAGE_KEYS.CURRENT_USER);
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        const match = SEED_USERS.find(u => u.id_usuario === parsed.id_usuario);
        if (match) return match;
      } catch {
        // ignore
      }
    }
    return SEED_USERS[0]; // Carlos Mendoza (Admin)
  });

  const [courses, setCourses] = useState<Course[]>(() => {
    const saved = localStorage.getItem(STORAGE_KEYS.COURSES);
    return saved ? JSON.parse(saved) : SEED_COURSES;
  });

  const [students] = useState<Student[]>(() => {
    const saved = localStorage.getItem(STORAGE_KEYS.STUDENTS);
    return saved ? JSON.parse(saved) : SEED_STUDENTS;
  });

  const [assignments] = useState<Assignment[]>(() => {
    const saved = localStorage.getItem(STORAGE_KEYS.ASSIGNMENTS);
    return saved ? JSON.parse(saved) : SEED_ASSIGNMENTS;
  });

  const [attendance, setAttendance] = useState<AttendanceRecord[]>(() => {
    const saved = localStorage.getItem(STORAGE_KEYS.ATTENDANCE);
    return saved ? JSON.parse(saved) : SEED_ATTENDANCE;
  });

  const [justifications, setJustifications] = useState<Justification[]>(() => {
    const saved = localStorage.getItem(STORAGE_KEYS.JUSTIFICATIONS);
    return saved ? JSON.parse(saved) : SEED_JUSTIFICATIONS;
  });

  const [auditLog, setAuditLog] = useState<AuditRecord[]>(() => {
    const saved = localStorage.getItem(STORAGE_KEYS.AUDIT);
    return saved ? JSON.parse(saved) : SEED_AUDIT;
  });

  const [summaries, setSummaries] = useState<WeeklySummary[]>(() => {
    const saved = localStorage.getItem(STORAGE_KEYS.SUMMARIES);
    return saved ? JSON.parse(saved) : SEED_SUMMARIES;
  });

  useEffect(() => {
    localStorage.setItem(STORAGE_KEYS.CURRENT_USER, JSON.stringify(currentUser));
  }, [currentUser]);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEYS.COURSES, JSON.stringify(courses));
  }, [courses]);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEYS.ATTENDANCE, JSON.stringify(attendance));
  }, [attendance]);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEYS.JUSTIFICATIONS, JSON.stringify(justifications));
  }, [justifications]);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEYS.AUDIT, JSON.stringify(auditLog));
  }, [auditLog]);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEYS.SUMMARIES, JSON.stringify(summaries));
  }, [summaries]);

  // Helper to append audit entry
  const logAudit = (accion: string, tabla: string, idRegistro: string, detalle: string) => {
    const newEntry: AuditRecord = {
      id_evento: `EVT-${Date.now().toString().slice(-6)}`,
      timestamp: new Date().toISOString().replace('T', ' ').slice(0, 19),
      usuario: currentUser.email,
      accion,
      tabla_afectada: tabla,
      id_registro: idRegistro,
      detalle
    };
    setAuditLog(prev => [newEntry, ...prev]);
  };

  // Permission check for attendance by course
  const canRecordAttendanceForCourse = (courseId: string): boolean => {
    if (currentUser.rol === 'Administrador' || currentUser.rol === 'Inspector') {
      return true;
    }
    if (currentUser.rol === 'Docente') {
      return assignments.some(
        a => a.id_usuario === currentUser.id_usuario && (a.id_nivel === courseId || courseId.includes(a.id_nivel))
      );
    }
    return false; // Directivo is read-only for recording
  };

  // Record bulk attendance for a course on a date
  const recordBulkAttendance = (
    courseId: string,
    dateStr: string,
    records: { studentId: string; status: AttendanceStatus; observation: string }[]
  ) => {
    // 1. Check weekday (Mon-Fri only)
    const { allowed, dayName } = isWeekdayAllowed(dateStr);
    if (!allowed) {
      return {
        success: false,
        message: `No se puede registrar asistencia en fin de semana (${dayName}). Solo lunes a viernes.`
      };
    }

    // 2. Check course exists and is active
    const course = courses.find(c => c.id_nivel === courseId);
    if (!course || course.estado !== 'Activo') {
      return { success: false, message: 'El curso seleccionado no está activo o no existe.' };
    }

    // 3. Check user permissions
    if (!canRecordAttendanceForCourse(courseId)) {
      return {
        success: false,
        message: `El usuario ${currentUser.nombre_completo} (${currentUser.rol}) no tiene autorización para registrar asistencia en este curso.`
      };
    }

    const timestamp = new Date().toISOString().replace('T', ' ').slice(0, 19);
    const updated = [...attendance];

    records.forEach(item => {
      // Find if record already exists for student and date
      const existingIdx = updated.findIndex(
        a => a.id_estudiante === item.studentId && a.fecha === dateStr
      );

      if (existingIdx >= 0) {
        // Update existing record, preserving original registered jornada if already present
        updated[existingIdx] = {
          ...updated[existingIdx],
          estado: item.status,
          observacion: item.observation,
          registrado_por: currentUser.email,
          timestamp
        };
      } else {
        // Insert new record
        updated.push({
          id_asistencia: `ATT-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
          id_estudiante: item.studentId,
          fecha: dateStr,
          estado: item.status,
          observacion: item.observation,
          registrado_por: currentUser.email,
          timestamp,
          jornada: course.jornada
        });
      }
    });

    setAttendance(updated);
    logAudit(
      'REGISTRO_MASIVO_ASISTENCIA',
      'Asistencias',
      courseId,
      `Registro masivo de asistencia para curso ${course.nombre_nivel} fecha ${dateStr} (${records.length} alumnos)`
    );

    return {
      success: true,
      message: `Asistencia guardada exitosamente para ${records.length} alumnos.`,
      count: records.length
    };
  };

  // Change course jornada (Admin only)
  const changeCourseJornada = (courseId: string, newJornada: Jornada, reason: string) => {
    if (currentUser.rol !== 'Administrador') {
      return { success: false, message: 'Solo el Administrador puede modificar la jornada de un curso.' };
    }

    const course = courses.find(c => c.id_nivel === courseId);
    if (!course) {
      return { success: false, message: 'Curso no encontrado.' };
    }

    const oldJornada = course.jornada;
    setCourses(prev =>
      prev.map(c =>
        c.id_nivel === courseId
          ? {
              ...c,
              jornada: newJornada,
              fecha_modificacion: new Date().toISOString().slice(0, 10)
            }
          : c
      )
    );

    logAudit(
      'CAMBIAR_JORNADA_CURSO',
      'Niveles',
      courseId,
      `Cambio de jornada de ${course.nombre_nivel}: ${oldJornada} -> ${newJornada}. Motivo: ${reason}`
    );

    return {
      success: true,
      message: `Jornada del curso ${course.nombre_nivel} actualizada a ${newJornada}.`
    };
  };

  // Create Justification (Inspector or Admin)
  const createJustification = ({
    studentId,
    startDate,
    endDate,
    tipo,
    motivo,
    fileUrl
  }: {
    studentId: string;
    startDate: string;
    endDate: string;
    tipo: JustificationType;
    motivo: string;
    fileUrl?: string;
  }) => {
    if (currentUser.rol !== 'Administrador' && currentUser.rol !== 'Inspector') {
      return {
        success: false,
        message: 'Solo Administradores o Inspectores pueden ingresar solicitudes de justificativo.'
      };
    }

    const student = students.find(s => s.id_estudiante === studentId);
    if (!student) {
      return { success: false, message: 'Estudiante no encontrado.' };
    }

    const newJust: Justification = {
      id_justificativo: `JUST-${Date.now().toString().slice(-4)}`,
      id_estudiante: studentId,
      fecha_inicio: startDate,
      fecha_fin: endDate,
      tipo,
      motivo,
      url_archivo_drive: fileUrl || `https://drive.google.com/justificativos/${studentId}_${startDate}.pdf`,
      estado_aprobacion: 'Pendiente',
      registrado_por: currentUser.email,
      timestamp: new Date().toISOString().replace('T', ' ').slice(0, 19)
    };

    setJustifications(prev => [newJust, ...prev]);
    logAudit(
      'CREAR_JUSTIFICATIVO',
      'Justificativos',
      newJust.id_justificativo,
      `Solicitud de justificativo ${tipo} para ${student.nombres} ${student.apellidos} (${startDate} a ${endDate})`
    );

    return {
      success: true,
      message: 'Solicitud de justificativo registrada exitosamente.'
    };
  };

  // Approve Justification (Directivo, Inspector, Admin)
  const approveJustification = (justificationId: string) => {
    if (
      currentUser.rol !== 'Administrador' &&
      currentUser.rol !== 'Directivo' &&
      currentUser.rol !== 'Inspector'
    ) {
      return { success: false, message: 'No tiene permisos para aprobar justificativos.' };
    }

    const just = justifications.find(j => j.id_justificativo === justificationId);
    if (!just) {
      return { success: false, message: 'Justificativo no encontrado.' };
    }

    // Update justification status
    setJustifications(prev =>
      prev.map(j =>
        j.id_justificativo === justificationId
          ? {
              ...j,
              estado_aprobacion: 'Aprobado',
              aprobado_por: currentUser.email
            }
          : j
      )
    );

    // Business rule: Sync all attendance records within [fecha_inicio, fecha_fin] for this student to 'Justificado'
    const student = students.find(s => s.id_estudiante === just.id_estudiante);
    const course = courses.find(c => c.id_nivel === student?.id_nivel);
    const jornadaToUse = course?.jornada || 'Mañana';
    const timestamp = new Date().toISOString().replace('T', ' ').slice(0, 19);

    setAttendance(prev => {
      const updated = [...prev];
      // Generate dates between start and end
      const start = new Date(just.fecha_inicio + 'T00:00:00');
      const end = new Date(just.fecha_fin + 'T00:00:00');
      const current = new Date(start);

      while (current <= end) {
        const dateStr = current.toISOString().slice(0, 10);
        const { allowed } = isWeekdayAllowed(dateStr);
        if (allowed) {
          const idx = updated.findIndex(
            a => a.id_estudiante === just.id_estudiante && a.fecha === dateStr
          );
          if (idx >= 0) {
            updated[idx] = {
              ...updated[idx],
              estado: 'Justificado',
              observacion: `Justificado: ${just.tipo} - ${just.motivo.slice(0, 40)}`,
              registrado_por: currentUser.email,
              timestamp
            };
          } else {
            updated.push({
              id_asistencia: `ATT-JUST-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
              id_estudiante: just.id_estudiante,
              fecha: dateStr,
              estado: 'Justificado',
              observacion: `Justificado: ${just.tipo} - ${just.motivo.slice(0, 40)}`,
              registrado_por: currentUser.email,
              timestamp,
              jornada: jornadaToUse
            });
          }
        }
        current.setDate(current.getDate() + 1);
      }
      return updated;
    });

    logAudit(
      'APROBAR_JUSTIFICATIVO',
      'Justificativos',
      justificationId,
      `Aprobación de justificativo ${justificationId} y sincronización de asistencias a Justificado`
    );

    return {
      success: true,
      message: 'Justificativo aprobado y registros de asistencia sincronizados a "Justificado".'
    };
  };

  // Reject Justification
  const rejectJustification = (justificationId: string, notes?: string) => {
    if (
      currentUser.rol !== 'Administrador' &&
      currentUser.rol !== 'Directivo' &&
      currentUser.rol !== 'Inspector'
    ) {
      return { success: false, message: 'No tiene permisos para rechazar justificativos.' };
    }

    setJustifications(prev =>
      prev.map(j =>
        j.id_justificativo === justificationId
          ? {
              ...j,
              estado_aprobacion: 'Rechazado',
              aprobado_por: currentUser.email
            }
          : j
      )
    );

    logAudit(
      'RECHAZAR_JUSTIFICATIVO',
      'Justificativos',
      justificationId,
      `Rechazo de justificativo ${justificationId}. Motivo: ${notes || 'No cumple requisitos'}`
    );

    return {
      success: true,
      message: 'Justificativo marcado como Rechazado.'
    };
  };

  // Generate weekly summary
  const generateWeeklySummary = (weekStart: string, weekEnd: string, recipients = 'direccion@institucion.edu') => {
    const rangeRecords = attendance.filter(
      a => a.fecha >= weekStart && a.fecha <= weekEnd
    );

    const total = rangeRecords.length;
    const presentOrJustified = rangeRecords.filter(
      a => a.estado === 'Presente' || a.estado === 'Justificado' || a.estado === 'Atrasado'
    ).length;

    const percentage = total > 0 ? Number(((presentOrJustified / total) * 100).toFixed(1)) : 100.0;

    const absentStudentsSet = new Set(
      rangeRecords.filter(a => a.estado === 'Ausente').map(a => a.id_estudiante)
    );

    const morningRecords = rangeRecords.filter(a => a.jornada === 'Mañana');
    const afternoonRecords = rangeRecords.filter(a => a.jornada === 'Tarde');
    const nightRecords = rangeRecords.filter(a => a.jornada === 'Noche');

    const detail = {
      por_jornada: {
        Mañana: {
          total: morningRecords.length,
          presentes: morningRecords.filter(a => a.estado === 'Presente').length
        },
        Tarde: {
          total: afternoonRecords.length,
          presentes: afternoonRecords.filter(a => a.estado === 'Presente').length
        },
        Noche: {
          total: nightRecords.length,
          presentes: nightRecords.filter(a => a.estado === 'Presente').length
        }
      }
    };

    const newSummary: WeeklySummary = {
      id_resumen: `SUM-${Date.now().toString().slice(-6)}`,
      clave: `RES-${weekStart}_${weekEnd}`,
      semana_inicio: weekStart,
      semana_fin: weekEnd,
      alcance: 'Institucional Completo',
      generado_por: currentUser.email,
      timestamp: new Date().toISOString().replace('T', ' ').slice(0, 19),
      total_registros: total,
      porcentaje_asistencia: percentage,
      alumnos_con_ausencias: absentStudentsSet.size,
      destinatarios: recipients,
      detalle_json: JSON.stringify(detail, null, 2)
    };

    setSummaries(prev => [newSummary, ...prev]);
    logAudit(
      'RESUMEN_SEMANAL_GENERADO',
      'Resumenes',
      newSummary.id_resumen,
      `Generación de resumen semanal del ${weekStart} al ${weekEnd} (${percentage}% asistencia general)`
    );

    return {
      success: true,
      summary: newSummary,
      message: `Resumen semanal generado con éxito (${percentage}% de asistencia).`
    };
  };

  const resetToDefaults = () => {
    localStorage.clear();
    setCurrentUser(SEED_USERS[0]);
    setCourses(SEED_COURSES);
    setAttendance(SEED_ATTENDANCE);
    setJustifications(SEED_JUSTIFICATIONS);
    setAuditLog(SEED_AUDIT);
    setSummaries(SEED_SUMMARIES);
  };

  return (
    <AppContext.Provider
      value={{
        currentUser,
        setCurrentUser,
        users,
        courses,
        students,
        assignments,
        attendance,
        justifications,
        auditLog,
        summaries,
        recordBulkAttendance,
        changeCourseJornada,
        createJustification,
        approveJustification,
        rejectJustification,
        generateWeeklySummary,
        resetToDefaults,
        canRecordAttendanceForCourse
      }}
    >
      {children}
    </AppContext.Provider>
  );
};

export const useApp = () => {
  const context = useContext(AppContext);
  if (!context) {
    throw new Error('useApp must be used within an AppProvider');
  }
  return context;
};
