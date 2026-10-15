import React, { useState, useEffect } from 'react';
import { useApp } from '../context/AppContext';
import { AttendanceStatus } from '../types';
import { isWeekdayAllowed, getJornadaClassHours } from '../services/scheduleService';
import {
  Calendar,
  Clock,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  HelpCircle,
  Save,
  CheckCheck,
  User,
  ShieldAlert,
  Info
} from 'lucide-react';

export const AttendanceView: React.FC = () => {
  const {
    currentUser,
    courses,
    students,
    assignments,
    attendance,
    justifications,
    recordBulkAttendance,
    canRecordAttendanceForCourse
  } = useApp();

  // Date state: default to a standard weekday e.g. 2026-10-14
  const [selectedDate, setSelectedDate] = useState<string>('2026-10-14');
  const [selectedCourseId, setSelectedCourseId] = useState<string>('N-101');
  const [statusMap, setStatusMap] = useState<Record<string, AttendanceStatus>>({});
  const [obsMap, setObsMap] = useState<Record<string, string>>({});
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  // Filter courses by assigned if teacher
  const isTeacher = currentUser.rol === 'Docente';
  const assignedCourseIds = assignments
    .filter(a => a.id_usuario === currentUser.id_usuario)
    .map(a => a.id_nivel);

  // Auto-select first course when changing user
  useEffect(() => {
    if (isTeacher && assignedCourseIds.length > 0 && !assignedCourseIds.includes(selectedCourseId)) {
      setSelectedCourseId(assignedCourseIds[0]);
    }
  }, [currentUser]);

  const selectedCourse = courses.find(c => c.id_nivel === selectedCourseId) || courses[0];
  const courseStudents = students.filter(s => s.id_nivel === selectedCourseId);

  const { allowed: isAllowedDay, dayName, isFriday } = isWeekdayAllowed(selectedDate);
  const classHours = selectedCourse
    ? getJornadaClassHours(selectedCourse.jornada, isFriday)
    : { start: '09:00', classEnd: '13:00', shiftEnd: '13:00' };

  // Load existing records for this course and date
  useEffect(() => {
    const newStatusMap: Record<string, AttendanceStatus> = {};
    const newObsMap: Record<string, string> = {};

    courseStudents.forEach(st => {
      const existing = attendance.find(
        a => a.id_estudiante === st.id_estudiante && a.fecha === selectedDate
      );
      if (existing) {
        newStatusMap[st.id_estudiante] = existing.estado;
        newObsMap[st.id_estudiante] = existing.observacion || '';
      } else {
        // Default to 'Presente' if not registered yet
        newStatusMap[st.id_estudiante] = 'Presente';
        newObsMap[st.id_estudiante] = '';
      }
    });

    setStatusMap(newStatusMap);
    setObsMap(newObsMap);
    setFeedback(null);
  }, [selectedDate, selectedCourseId, courseStudents.length]);

  const handleStatusChange = (studentId: string, status: AttendanceStatus) => {
    setStatusMap(prev => ({ ...prev, [studentId]: status }));
  };

  const handleObsChange = (studentId: string, obs: string) => {
    setObsMap(prev => ({ ...prev, [studentId]: obs }));
  };

  const handleMarkAllPresent = () => {
    const updated: Record<string, AttendanceStatus> = {};
    courseStudents.forEach(st => {
      updated[st.id_estudiante] = 'Presente';
    });
    setStatusMap(updated);
  };

  const handleSaveAttendance = () => {
    const records = courseStudents.map(st => ({
      studentId: st.id_estudiante,
      status: statusMap[st.id_estudiante] || 'Presente',
      observation: obsMap[st.id_estudiante] || ''
    }));

    const result = recordBulkAttendance(selectedCourseId, selectedDate, records);
    if (result.success) {
      setFeedback({ type: 'success', message: result.message });
    } else {
      setFeedback({ type: 'error', message: result.message });
    }
  };

  // Metrics for current course/date view
  const totalCount = courseStudents.length;
  const presentCount = courseStudents.filter(st => statusMap[st.id_estudiante] === 'Presente').length;
  const absentCount = courseStudents.filter(st => statusMap[st.id_estudiante] === 'Ausente').length;
  const lateCount = courseStudents.filter(st => statusMap[st.id_estudiante] === 'Atrasado').length;
  const justifiedCount = courseStudents.filter(st => statusMap[st.id_estudiante] === 'Justificado').length;
  const attendanceRate = totalCount > 0 ? Math.round(((presentCount + justifiedCount + lateCount) / totalCount) * 100) : 0;

  const canEdit = canRecordAttendanceForCourse(selectedCourseId);

  return (
    <div className="space-y-6">
      {/* Control bar: Date and Course selection */}
      <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex flex-wrap items-center gap-3">
            {/* Date Input */}
            <div className="flex items-center space-x-2">
              <Calendar className="w-5 h-5 text-slate-500" />
              <div>
                <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider">
                  Fecha
                </label>
                <input
                  type="date"
                  value={selectedDate}
                  onChange={e => setSelectedDate(e.target.value)}
                  className="mt-0.5 text-sm font-semibold bg-slate-50 border border-slate-300 rounded-lg px-3 py-1.5 text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <span className="text-xs font-medium px-2 py-1 rounded-md bg-slate-100 text-slate-700 mt-4">
                {dayName} {isFriday && '• Horario Viernes'}
              </span>
            </div>

            {/* Course Selector */}
            <div className="flex items-center space-x-2 ml-0 sm:ml-4">
              <div>
                <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider">
                  Curso / Nivel
                </label>
                <select
                  value={selectedCourseId}
                  onChange={e => setSelectedCourseId(e.target.value)}
                  className="mt-0.5 text-sm font-semibold bg-slate-50 border border-slate-300 rounded-lg px-3 py-1.5 text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500 cursor-pointer min-w-[200px]"
                >
                  {courses.map(c => {
                    const isAssigned = assignedCourseIds.includes(c.id_nivel);
                    return (
                      <option key={c.id_nivel} value={c.id_nivel}>
                        {c.nombre_nivel} ({c.jornada}) {isTeacher && isAssigned ? '★ Asignado' : ''}
                      </option>
                    );
                  })}
                </select>
              </div>
            </div>
          </div>

          {/* Quick Date Presets */}
          <div className="flex items-center space-x-2">
            <span className="text-xs text-slate-500">Días de prueba:</span>
            <button
              onClick={() => setSelectedDate('2026-10-12')}
              className="text-xs px-2.5 py-1 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-md font-medium"
            >
              Lun 12
            </button>
            <button
              onClick={() => setSelectedDate('2026-10-14')}
              className="text-xs px-2.5 py-1 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-md font-medium"
            >
              Mié 14
            </button>
            <button
              onClick={() => setSelectedDate('2026-10-16')}
              className="text-xs px-2.5 py-1 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-md font-medium"
            >
              Vie 16
            </button>
            <button
              onClick={() => setSelectedDate('2026-10-17')}
              className="text-xs px-2.5 py-1 bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 rounded-md font-medium"
              title="Probar regla de rechazo en sábado"
            >
              Sáb 17 (Prueba)
            </button>
          </div>
        </div>

        {/* Warning if Weekend is selected */}
        {!isAllowedDay && (
          <div className="mt-4 p-3 bg-rose-50 border border-rose-200 rounded-xl flex items-start space-x-3 text-rose-800 text-sm">
            <AlertTriangle className="w-5 h-5 text-rose-600 shrink-0 mt-0.5" />
            <div>
              <p className="font-semibold">Registro no permitido en fin de semana ({dayName})</p>
              <p className="text-xs text-rose-700 mt-0.5">
                La normativa escolar y la regla de negocio del sistema restringe el registro de asistencia exclusivamente a días hábiles (lunes a viernes).
              </p>
            </div>
          </div>
        )}

        {/* Warning if Teacher is not assigned to course */}
        {isTeacher && !canEdit && (
          <div className="mt-4 p-3 bg-amber-50 border border-amber-200 rounded-xl flex items-start space-x-3 text-amber-800 text-sm">
            <ShieldAlert className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
            <div>
              <p className="font-semibold">Acceso de solo lectura para este curso</p>
              <p className="text-xs text-amber-700 mt-0.5">
                Usted ha iniciado sesión como {currentUser.nombre_completo} (Docente). Según la matriz de seguridad institucional, los docentes solo pueden registrar asistencia en sus cursos asignados ({assignedCourseIds.join(', ')}).
              </p>
            </div>
          </div>
        )}

        {/* Jornada & Timetable Pill Info */}
        {selectedCourse && (
          <div className="mt-4 pt-4 border-t border-slate-100 flex flex-wrap items-center justify-between text-xs text-slate-600 gap-2">
            <div className="flex items-center space-x-2">
              <span className="font-semibold text-slate-700">Jornada:</span>
              <span className="px-2.5 py-0.5 rounded-full bg-blue-50 text-blue-700 font-bold border border-blue-200">
                {selectedCourse.jornada}
              </span>
              <div className="flex items-center space-x-1 text-slate-500 ml-2">
                <Clock className="w-3.5 h-3.5" />
                <span>
                  Horario de clases: {classHours.start} - {classHours.classEnd}
                  {isFriday ? ' (4 bloques de 45 min)' : ' (5 bloques de 45 min)'}
                </span>
              </div>
            </div>

            <div className="flex items-center space-x-2">
              <span className="text-slate-400">ID Curso:</span>
              <code className="bg-slate-100 px-1.5 py-0.5 rounded font-mono text-slate-700">
                {selectedCourse.id_nivel}
              </code>
            </div>
          </div>
        )}
      </div>

      {/* Stats Summary Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs">
          <p className="text-xs font-semibold text-slate-500 uppercase">Matrícula</p>
          <p className="text-2xl font-bold text-slate-900 mt-1">{totalCount}</p>
          <p className="text-xs text-slate-400 mt-0.5">Estudiantes</p>
        </div>

        <div className="bg-emerald-50 p-4 rounded-xl border border-emerald-200 shadow-xs">
          <p className="text-xs font-semibold text-emerald-700 uppercase">Presentes</p>
          <div className="flex items-baseline space-x-1 mt-1">
            <p className="text-2xl font-bold text-emerald-800">{presentCount}</p>
            <p className="text-xs font-medium text-emerald-600">
              ({totalCount > 0 ? Math.round((presentCount / totalCount) * 100) : 0}%)
            </p>
          </div>
          <p className="text-xs text-emerald-600 mt-0.5">En aula</p>
        </div>

        <div className="bg-rose-50 p-4 rounded-xl border border-rose-200 shadow-xs">
          <p className="text-xs font-semibold text-rose-700 uppercase">Ausentes</p>
          <p className="text-2xl font-bold text-rose-800 mt-1">{absentCount}</p>
          <p className="text-xs text-rose-600 mt-0.5">Sin justificar</p>
        </div>

        <div className="bg-amber-50 p-4 rounded-xl border border-amber-200 shadow-xs">
          <p className="text-xs font-semibold text-amber-700 uppercase">Atrasados</p>
          <p className="text-2xl font-bold text-amber-800 mt-1">{lateCount}</p>
          <p className="text-xs text-amber-600 mt-0.5">Ingreso tardío</p>
        </div>

        <div className="bg-blue-50 p-4 rounded-xl border border-blue-200 shadow-xs">
          <p className="text-xs font-semibold text-blue-700 uppercase">Justificados</p>
          <p className="text-2xl font-bold text-blue-800 mt-1">{justifiedCount}</p>
          <p className="text-xs text-blue-600 mt-0.5">Con certificado</p>
        </div>

        <div className="bg-indigo-50 p-4 rounded-xl border border-indigo-200 shadow-xs">
          <p className="text-xs font-semibold text-indigo-700 uppercase">Asistencia</p>
          <p className="text-2xl font-bold text-indigo-800 mt-1">{attendanceRate}%</p>
          <p className="text-xs text-indigo-600 mt-0.5">Meta: ≥ 85%</p>
        </div>
      </div>

      {/* Action feedback notification */}
      {feedback && (
        <div
          className={`p-4 rounded-xl border flex items-center space-x-3 text-sm ${
            feedback.type === 'success'
              ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
              : 'bg-rose-50 border-rose-200 text-rose-800'
          }`}
        >
          {feedback.type === 'success' ? (
            <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
          ) : (
            <XCircle className="w-5 h-5 text-rose-600 shrink-0" />
          )}
          <span className="font-medium">{feedback.message}</span>
        </div>
      )}

      {/* Student Attendance Table */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
        {/* Table Toolbar */}
        <div className="p-4 border-b border-slate-200 bg-slate-50 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center space-x-2">
            <h2 className="text-sm font-bold text-slate-800">
              Nómina de Asistencia • {selectedCourse?.nombre_nivel}
            </h2>
            <span className="text-xs bg-slate-200 text-slate-700 px-2 py-0.5 rounded-full font-medium">
              {courseStudents.length} estudiantes
            </span>
          </div>

          <div className="flex items-center space-x-3">
            {canEdit && (
              <button
                type="button"
                onClick={handleMarkAllPresent}
                disabled={!isAllowedDay}
                className="flex items-center space-x-1.5 text-xs font-semibold px-3 py-1.5 bg-white hover:bg-slate-100 text-slate-700 border border-slate-300 rounded-lg shadow-2xs transition-colors disabled:opacity-50"
              >
                <CheckCheck className="w-4 h-4 text-emerald-600" />
                <span>Marcar Todos Presente</span>
              </button>
            )}

            <button
              type="button"
              onClick={handleSaveAttendance}
              disabled={!isAllowedDay || !canEdit}
              className="flex items-center space-x-2 text-xs font-bold px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg shadow-xs transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <Save className="w-4 h-4" />
              <span>Guardar Asistencia</span>
            </button>
          </div>
        </div>

        {/* List of students */}
        {courseStudents.length === 0 ? (
          <div className="p-12 text-center text-slate-500">
            <User className="w-10 h-10 mx-auto text-slate-300 mb-2" />
            <p className="font-medium">No hay estudiantes matriculados en este curso.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-200 text-slate-500 text-xs uppercase tracking-wider bg-white">
                  <th className="py-3 px-4 font-semibold">N°</th>
                  <th className="py-3 px-4 font-semibold">Estudiante</th>
                  <th className="py-3 px-4 font-semibold">RUT / DNI</th>
                  <th className="py-3 px-4 font-semibold">Estado de Asistencia</th>
                  <th className="py-3 px-4 font-semibold">Observación</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-sm">
                {courseStudents.map((st, index) => {
                  const currentStatus = statusMap[st.id_estudiante] || 'Presente';
                  const currentObs = obsMap[st.id_estudiante] || '';

                  // Check if student has an active approved justification for this date
                  const activeJust = justifications.find(
                    j =>
                      j.id_estudiante === st.id_estudiante &&
                      j.estado_aprobacion === 'Aprobado' &&
                      selectedDate >= j.fecha_inicio &&
                      selectedDate <= j.fecha_fin
                  );

                  return (
                    <tr
                      key={st.id_estudiante}
                      className="hover:bg-slate-50/70 transition-colors"
                    >
                      <td className="py-3.5 px-4 text-xs font-semibold text-slate-400">
                        {index + 1}
                      </td>
                      <td className="py-3.5 px-4 font-medium text-slate-900">
                        <div>
                          <span>
                            {st.nombres} {st.apellidos}
                          </span>
                          {activeJust && (
                            <span className="ml-2 inline-flex items-center text-xs px-2 py-0.5 rounded-full bg-blue-100 text-blue-700 font-semibold border border-blue-200">
                              <Info className="w-3 h-3 mr-1" />
                              Licencia {activeJust.tipo}
                            </span>
                          )}
                        </div>
                        <span className="text-xs text-slate-400 block sm:hidden">
                          {st.rut_dni}
                        </span>
                      </td>
                      <td className="py-3.5 px-4 text-xs font-mono text-slate-600 hidden sm:table-cell">
                        {st.rut_dni}
                      </td>
                      <td className="py-3.5 px-4">
                        <div className="flex flex-wrap items-center gap-1.5">
                          {/* Presente */}
                          <button
                            type="button"
                            disabled={!canEdit || !isAllowedDay}
                            onClick={() => handleStatusChange(st.id_estudiante, 'Presente')}
                            className={`px-3 py-1 text-xs font-semibold rounded-lg transition-all ${
                              currentStatus === 'Presente'
                                ? 'bg-emerald-600 text-white shadow-2xs'
                                : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                            }`}
                          >
                            Presente
                          </button>

                          {/* Ausente */}
                          <button
                            type="button"
                            disabled={!canEdit || !isAllowedDay}
                            onClick={() => handleStatusChange(st.id_estudiante, 'Ausente')}
                            className={`px-3 py-1 text-xs font-semibold rounded-lg transition-all ${
                              currentStatus === 'Ausente'
                                ? 'bg-rose-600 text-white shadow-2xs'
                                : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                            }`}
                          >
                            Ausente
                          </button>

                          {/* Atrasado */}
                          <button
                            type="button"
                            disabled={!canEdit || !isAllowedDay}
                            onClick={() => handleStatusChange(st.id_estudiante, 'Atrasado')}
                            className={`px-3 py-1 text-xs font-semibold rounded-lg transition-all ${
                              currentStatus === 'Atrasado'
                                ? 'bg-amber-600 text-white shadow-2xs'
                                : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                            }`}
                          >
                            Atrasado
                          </button>

                          {/* Justificado */}
                          <button
                            type="button"
                            disabled={!canEdit || !isAllowedDay}
                            onClick={() => handleStatusChange(st.id_estudiante, 'Justificado')}
                            className={`px-3 py-1 text-xs font-semibold rounded-lg transition-all ${
                              currentStatus === 'Justificado'
                                ? 'bg-blue-600 text-white shadow-2xs'
                                : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                            }`}
                          >
                            Justificado
                          </button>
                        </div>
                      </td>
                      <td className="py-3.5 px-4">
                        <input
                          type="text"
                          disabled={!canEdit || !isAllowedDay}
                          value={currentObs}
                          onChange={e => handleObsChange(st.id_estudiante, e.target.value)}
                          placeholder="Nota u observación..."
                          className="w-full text-xs bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1 text-slate-700 focus:bg-white focus:outline-none focus:ring-1 focus:ring-blue-500 disabled:bg-slate-100"
                        />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};
