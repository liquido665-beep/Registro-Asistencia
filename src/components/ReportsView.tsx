import React, { useState } from 'react';
import { useApp } from '../context/AppContext';
import { CONFIG } from '../constants/config';
import { getWeeklySummaryRunTime } from '../services/scheduleService';
import {
  BarChart3,
  AlertTriangle,
  FileSpreadsheet,
  Mail,
  Calendar,
  CheckCircle2,
  TrendingDown,
  TrendingUp,
  Download,
  Clock,
  Sparkles
} from 'lucide-react';

export const ReportsView: React.FC = () => {
  const { courses, students, attendance, summaries, generateWeeklySummary } = useApp();

  const [weekStart, setWeekStart] = useState<string>('2026-10-12');
  const [weekEnd, setWeekEnd] = useState<string>('2026-10-16');
  const [recipients, setRecipients] = useState<string>('direccion@institucion.edu, inspectoria@institucion.edu');
  const [feedback, setFeedback] = useState<string | null>(null);

  // Overall attendance calculation
  const totalRecords = attendance.length;
  const presentCount = attendance.filter(
    a => a.estado === 'Presente' || a.estado === 'Atrasado' || a.estado === 'Justificado'
  ).length;
  const overallRate = totalRecords > 0 ? Math.round((presentCount / totalRecords) * 100) : 100;

  // Calculate stats per course
  const courseStats = courses.map(course => {
    const courseStudents = students.filter(s => s.id_nivel === course.id_nivel);
    const studentIds = new Set(courseStudents.map(s => s.id_estudiante));
    const courseAttendance = attendance.filter(a => studentIds.has(a.id_estudiante));

    const total = courseAttendance.length;
    const attended = courseAttendance.filter(
      a => a.estado === 'Presente' || a.estado === 'Atrasado' || a.estado === 'Justificado'
    ).length;
    const rate = total > 0 ? Math.round((attended / total) * 100) : 100;

    return {
      course,
      studentCount: courseStudents.length,
      recordsCount: total,
      rate
    };
  });

  // Calculate at-risk students (< 85% attendance)
  const atRiskStudents = students
    .map(st => {
      const stAttendance = attendance.filter(a => a.id_estudiante === st.id_estudiante);
      const total = stAttendance.length;
      if (total === 0) return null; // No history yet

      const attended = stAttendance.filter(
        a => a.estado === 'Presente' || a.estado === 'Atrasado' || a.estado === 'Justificado'
      ).length;
      const rate = Math.round((attended / total) * 100);
      const absences = stAttendance.filter(a => a.estado === 'Ausente').length;

      if (rate < CONFIG.REPORTS.CRITICAL_THRESHOLD_PERCENT) {
        const course = courses.find(c => c.id_nivel === st.id_nivel);
        return {
          student: st,
          courseName: course?.nombre_nivel || st.id_nivel,
          total,
          absences,
          rate
        };
      }
      return null;
    })
    .filter(Boolean) as {
    student: (typeof students)[0];
    courseName: string;
    total: number;
    absences: number;
    rate: number;
  }[];

  const handleGenerateSummary = () => {
    const res = generateWeeklySummary(weekStart, weekEnd, recipients);
    if (res.success) {
      setFeedback(res.message);
      setTimeout(() => setFeedback(null), 4000);
    }
  };

  const autoRunTime = getWeeklySummaryRunTime('19:00'); // 22:40

  return (
    <div className="space-y-8">
      {/* Top Banner KPI */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs flex items-center justify-between">
          <div>
            <p className="text-xs font-semibold text-slate-500 uppercase">
              Asistencia General del Colegio
            </p>
            <p className="text-3xl font-extrabold text-slate-900 mt-1">{overallRate}%</p>
            <p className="text-xs text-slate-500 mt-1">
              {presentCount} de {totalRecords} asistencias computadas
            </p>
          </div>
          <div
            className={`w-12 h-12 rounded-2xl flex items-center justify-center ${
              overallRate >= 85 ? 'bg-emerald-100 text-emerald-700' : 'bg-rose-100 text-rose-700'
            }`}
          >
            {overallRate >= 85 ? (
              <TrendingUp className="w-6 h-6" />
            ) : (
              <TrendingDown className="w-6 h-6" />
            )}
          </div>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs flex items-center justify-between">
          <div>
            <p className="text-xs font-semibold text-slate-500 uppercase">
              Alumnos en Riesgo Crítico
            </p>
            <p className="text-3xl font-extrabold text-rose-600 mt-1">
              {atRiskStudents.length}
            </p>
            <p className="text-xs text-rose-600 mt-1">
              Asistencia inferior al {CONFIG.REPORTS.CRITICAL_THRESHOLD_PERCENT}%
            </p>
          </div>
          <div className="w-12 h-12 rounded-2xl bg-rose-100 text-rose-700 flex items-center justify-center">
            <AlertTriangle className="w-6 h-6" />
          </div>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs flex items-center justify-between">
          <div>
            <p className="text-xs font-semibold text-slate-500 uppercase">
              Disparador Automático Semanal
            </p>
            <p className="text-2xl font-bold font-mono text-slate-900 mt-1">
              Viernes {autoRunTime}
            </p>
            <p className="text-xs text-slate-500 mt-1">
              Calculado tras el cierre nocturno + 20 min
            </p>
          </div>
          <div className="w-12 h-12 rounded-2xl bg-indigo-100 text-indigo-700 flex items-center justify-center">
            <Clock className="w-6 h-6" />
          </div>
        </div>
      </div>

      {/* Critical At-Risk Alerts Section */}
      <div className="bg-white rounded-2xl border border-rose-200 shadow-xs overflow-hidden">
        <div className="p-5 border-b border-rose-100 bg-rose-50/60 flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <AlertTriangle className="w-5 h-5 text-rose-600" />
            <h3 className="font-bold text-slate-900 text-base">
              Alerta Semanal de Riesgo de Asistencia (&lt; 85%)
            </h3>
          </div>
          <span className="text-xs font-bold px-2.5 py-0.5 rounded-full bg-rose-100 text-rose-800 border border-rose-200">
            {atRiskStudents.length} estudiante(s) requieren seguimiento
          </span>
        </div>

        {atRiskStudents.length === 0 ? (
          <div className="p-8 text-center text-slate-500 text-sm">
            <CheckCircle2 className="w-8 h-8 text-emerald-500 mx-auto mb-2" />
            <p className="font-medium text-slate-700">
              Todos los estudiantes matriculados mantienen asistencia sobre el umbral del 85%.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-200 text-slate-500 text-xs uppercase tracking-wider bg-white">
                  <th className="py-3 px-4 font-semibold">Estudiante</th>
                  <th className="py-3 px-4 font-semibold">RUT</th>
                  <th className="py-3 px-4 font-semibold">Curso</th>
                  <th className="py-3 px-4 font-semibold">Tasa Asistencia</th>
                  <th className="py-3 px-4 font-semibold">Inasistencias</th>
                  <th className="py-3 px-4 font-semibold">Contacto Apoderado</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-sm">
                {atRiskStudents.map(({ student, courseName, total, absences, rate }) => (
                  <tr key={student.id_estudiante} className="hover:bg-rose-50/30 transition-colors">
                    <td className="py-3 px-4 font-medium text-slate-900">
                      {student.nombres} {student.apellidos}
                    </td>
                    <td className="py-3 px-4 font-mono text-xs text-slate-600">
                      {student.rut_dni}
                    </td>
                    <td className="py-3 px-4 text-xs font-semibold text-slate-700">
                      {courseName}
                    </td>
                    <td className="py-3 px-4">
                      <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-extrabold bg-rose-100 text-rose-800">
                        {rate}%
                      </span>
                    </td>
                    <td className="py-3 px-4 text-xs font-bold text-rose-700">
                      {absences} ausencias de {total}
                    </td>
                    <td className="py-3 px-4 text-xs text-slate-600">
                      <div className="flex items-center space-x-1.5">
                        <Mail className="w-3.5 h-3.5 text-slate-400" />
                        <span className="text-blue-600 font-mono text-xs">
                          {student.email_apoderado}
                        </span>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Course Breakdown Cards */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-xs p-6">
        <h3 className="font-bold text-slate-900 text-base mb-4 flex items-center space-x-2">
          <BarChart3 className="w-5 h-5 text-blue-600" />
          <span>Rendimiento por Curso y Jornada</span>
        </h3>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {courseStats.map(({ course, studentCount, recordsCount, rate }) => (
            <div
              key={course.id_nivel}
              className="p-4 rounded-xl border border-slate-200 bg-slate-50/50 hover:bg-white hover:border-slate-300 transition-all"
            >
              <div className="flex items-center justify-between">
                <span className="text-xs font-mono font-bold text-slate-500">
                  {course.id_nivel}
                </span>
                <span className="text-xs px-2 py-0.5 rounded-md font-semibold bg-blue-100 text-blue-700">
                  {course.jornada}
                </span>
              </div>
              <h4 className="font-bold text-slate-900 text-sm mt-1">
                {course.nombre_nivel}
              </h4>
              <p className="text-xs text-slate-500 mt-0.5">
                {studentCount} alumnos • {recordsCount} tomas registradas
              </p>

              <div className="mt-3">
                <div className="flex items-center justify-between text-xs font-bold mb-1">
                  <span className="text-slate-600">Asistencia</span>
                  <span
                    className={
                      rate >= 85 ? 'text-emerald-700' : 'text-rose-700'
                    }
                  >
                    {rate}%
                  </span>
                </div>
                <div className="w-full bg-slate-200 h-2 rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all duration-500 ${
                      rate >= 85 ? 'bg-emerald-500' : 'bg-rose-500'
                    }`}
                    style={{ width: `${Math.min(100, rate)}%` }}
                  />
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Weekly Summary Generator */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-xs p-6">
        <div className="flex flex-col md:flex-row md:items-center justify-between pb-6 border-b border-slate-200 gap-4">
          <div>
            <h3 className="font-bold text-slate-900 text-base flex items-center space-x-2">
              <FileSpreadsheet className="w-5 h-5 text-emerald-600" />
              <span>Generador de Resumen Semanal (Hoja Resumenes)</span>
            </h3>
            <p className="text-xs text-slate-500 mt-1">
              Calcula la consolidación semanal por jornada e inserta la fila idempotente en la hoja de control.
            </p>
          </div>

          <button
            onClick={handleGenerateSummary}
            className="flex items-center space-x-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-xl shadow-xs transition-colors shrink-0"
          >
            <Sparkles className="w-4 h-4" />
            <span>Generar y Consolidar Resumen</span>
          </button>
        </div>

        {feedback && (
          <div className="mt-4 p-3 bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-xl text-xs font-medium flex items-center space-x-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
            <span>{feedback}</span>
          </div>
        )}

        <div className="mt-4 grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div>
            <label className="block text-xs font-semibold text-slate-700">Lunes (Inicio Semana)</label>
            <input
              type="date"
              value={weekStart}
              onChange={e => setWeekStart(e.target.value)}
              className="mt-1 w-full text-xs bg-slate-50 border border-slate-300 rounded-lg p-2 text-slate-800"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700">Viernes (Fin Semana)</label>
            <input
              type="date"
              value={weekEnd}
              onChange={e => setWeekEnd(e.target.value)}
              className="mt-1 w-full text-xs bg-slate-50 border border-slate-300 rounded-lg p-2 text-slate-800"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700">Destinatarios Resumen</label>
            <input
              type="text"
              value={recipients}
              onChange={e => setRecipients(e.target.value)}
              className="mt-1 w-full text-xs bg-slate-50 border border-slate-300 rounded-lg p-2 text-slate-800"
            />
          </div>
        </div>

        {/* Existing Summaries History */}
        <div className="mt-6">
          <h4 className="text-xs font-bold text-slate-700 uppercase tracking-wider mb-2">
            Historial de Resúmenes Generados ({summaries.length})
          </h4>
          <div className="space-y-2">
            {summaries.map(sum => (
              <div
                key={sum.id_resumen}
                className="p-3 bg-slate-50 rounded-xl border border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between text-xs gap-2"
              >
                <div>
                  <span className="font-bold text-slate-800">{sum.clave}</span>
                  <span className="text-slate-500 ml-2">
                    ({sum.semana_inicio} al {sum.semana_fin})
                  </span>
                  <p className="text-2xs text-slate-400 mt-0.5">
                    Generado el {sum.timestamp} por {sum.generado_por}
                  </p>
                </div>
                <div className="flex items-center space-x-3">
                  <span className="font-bold text-emerald-700 bg-emerald-100 px-2 py-0.5 rounded">
                    {sum.porcentaje_asistencia}% Asistencia
                  </span>
                  <span className="text-slate-600 font-medium">
                    {sum.total_registros} registros
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};
