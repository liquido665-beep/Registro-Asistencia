import React, { useState } from 'react';
import { useApp } from '../context/AppContext';
import { Jornada } from '../types';
import { buildDaySchedule } from '../services/scheduleService';
import {
  BookOpen,
  Clock,
  ShieldCheck,
  Edit3,
  Calendar,
  Users,
  AlertCircle,
  CheckCircle2,
  Lock
} from 'lucide-react';

export const CoursesView: React.FC = () => {
  const { currentUser, courses, assignments, users, students, changeCourseJornada } = useApp();

  const [activeJornadaTab, setActiveJornadaTab] = useState<Jornada>('Mañana');
  const [isFridayView, setIsFridayView] = useState<boolean>(false);
  const [modalOpen, setModalOpen] = useState<boolean>(false);
  const [selectedCourseId, setSelectedCourseId] = useState<string>('N-101');
  const [targetJornada, setTargetJornada] = useState<Jornada>('Tarde');
  const [changeReason, setChangeReason] = useState<string>('');
  const [notification, setNotification] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  const isAdmin = currentUser.rol === 'Administrador';

  const scheduleBlocks = buildDaySchedule(activeJornadaTab, isFridayView);

  const handleOpenChangeJornada = (courseId: string, currentJornada: Jornada) => {
    setSelectedCourseId(courseId);
    setTargetJornada(currentJornada === 'Mañana' ? 'Tarde' : 'Mañana');
    setChangeReason('');
    setNotification(null);
    setModalOpen(true);
  };

  const handleConfirmChange = (e: React.FormEvent) => {
    e.preventDefault();
    if (!changeReason.trim()) {
      setNotification({ type: 'error', message: 'Debe ingresar un motivo para el cambio de jornada.' });
      return;
    }

    const res = changeCourseJornada(selectedCourseId, targetJornada, changeReason);
    if (res.success) {
      setNotification({ type: 'success', message: res.message });
      setTimeout(() => {
        setModalOpen(false);
      }, 1200);
    } else {
      setNotification({ type: 'error', message: res.message });
    }
  };

  return (
    <div className="space-y-8">
      {/* Top Banner */}
      <div className="bg-gradient-to-r from-blue-900 to-indigo-900 text-white p-6 rounded-2xl shadow-xs">
        <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
          <div>
            <div className="flex items-center space-x-2">
              <BookOpen className="w-6 h-6 text-blue-300" />
              <h2 className="text-xl font-bold">Catálogo de Cursos y Estructura de Jornadas</h2>
            </div>
            <p className="text-sm text-blue-200 mt-1 max-w-2xl">
              Cada nivel educativo opera bajo una jornada específica (Mañana, Tarde o Noche) con horarios calculados según el patrón de bloques y recesos.
            </p>
          </div>

          <div className="flex items-center space-x-3 bg-white/10 backdrop-blur-xs px-4 py-2.5 rounded-xl border border-white/20">
            <ShieldCheck className="w-5 h-5 text-emerald-400 shrink-0" />
            <div className="text-xs">
              <span className="font-semibold block">Permiso de Gestión:</span>
              <span className="text-blue-100">
                {isAdmin ? 'Autorizado (Administrador)' : 'Solo Administrador puede cambiar jornadas'}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Courses Catalog Table */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
        <div className="p-5 border-b border-slate-200 bg-slate-50 flex items-center justify-between">
          <div>
            <h3 className="font-bold text-slate-800 text-base">Cursos Registrados</h3>
            <p className="text-xs text-slate-500 mt-0.5">
              Identificadores estándar y legados (N-101 ↔ CUR-1A), asignaciones docentes y jornadas vigentes.
            </p>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-slate-200 text-slate-500 text-xs uppercase tracking-wider bg-white">
                <th className="py-3 px-4 font-semibold">ID / Alias</th>
                <th className="py-3 px-4 font-semibold">Nombre del Curso</th>
                <th className="py-3 px-4 font-semibold">Grado & Sección</th>
                <th className="py-3 px-4 font-semibold">Jornada Vigente</th>
                <th className="py-3 px-4 font-semibold">Docente(s) Asignado(s)</th>
                <th className="py-3 px-4 font-semibold">Matrícula</th>
                <th className="py-3 px-4 font-semibold text-right">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-sm">
              {courses.map(course => {
                const assignedDocs = assignments
                  .filter(a => a.id_nivel === course.id_nivel)
                  .map(a => {
                    const u = users.find(usr => usr.id_usuario === a.id_usuario);
                    return { ...a, teacherName: u?.nombre_completo || a.id_usuario };
                  });

                const enrolledCount = students.filter(s => s.id_nivel === course.id_nivel).length;

                return (
                  <tr key={course.id_nivel} className="hover:bg-slate-50/70 transition-colors">
                    <td className="py-3.5 px-4 font-mono text-xs font-bold text-slate-700">
                      <div>{course.id_nivel}</div>
                    </td>
                    <td className="py-3.5 px-4 font-medium text-slate-900">
                      {course.nombre_nivel}
                    </td>
                    <td className="py-3.5 px-4 text-xs text-slate-600">
                      {course.grado} • Sección {course.seccion}
                    </td>
                    <td className="py-3.5 px-4">
                      <span
                        className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-bold border ${
                          course.jornada === 'Mañana'
                            ? 'bg-amber-50 text-amber-800 border-amber-200'
                            : course.jornada === 'Tarde'
                            ? 'bg-blue-50 text-blue-800 border-blue-200'
                            : 'bg-indigo-50 text-indigo-800 border-indigo-200'
                        }`}
                      >
                        <Clock className="w-3 h-3 mr-1" />
                        {course.jornada}
                      </span>
                    </td>
                    <td className="py-3.5 px-4 text-xs text-slate-600">
                      {assignedDocs.length > 0 ? (
                        <div className="space-y-1">
                          {assignedDocs.map(d => (
                            <div key={d.id_asignacion} className="flex items-center space-x-1">
                              <span className="font-semibold text-slate-800">{d.teacherName}</span>
                              <span className="text-slate-400">({d.asignatura})</span>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <span className="text-slate-400 italic">Sin docente asignado</span>
                      )}
                    </td>
                    <td className="py-3.5 px-4 text-xs text-slate-700">
                      <div className="flex items-center space-x-1.5 font-medium">
                        <Users className="w-3.5 h-3.5 text-slate-400" />
                        <span>{enrolledCount} alumnos</span>
                      </div>
                    </td>
                    <td className="py-3.5 px-4 text-right">
                      {isAdmin ? (
                        <button
                          type="button"
                          onClick={() => handleOpenChangeJornada(course.id_nivel, course.jornada)}
                          className="inline-flex items-center space-x-1 text-xs font-semibold px-2.5 py-1.5 bg-blue-50 hover:bg-blue-100 text-blue-700 rounded-lg border border-blue-200 transition-colors"
                        >
                          <Edit3 className="w-3.5 h-3.5" />
                          <span>Cambiar Jornada</span>
                        </button>
                      ) : (
                        <span className="text-xs text-slate-400 inline-flex items-center space-x-1">
                          <Lock className="w-3 h-3 text-slate-400" />
                          <span>Solo Admin</span>
                        </span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Jornada Timetable Inspector */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-xs p-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-6 border-b border-slate-200 gap-4">
          <div>
            <h3 className="font-bold text-slate-900 text-base flex items-center space-x-2">
              <Calendar className="w-5 h-5 text-blue-600" />
              <span>Estructura Horaria de Jornada ({activeJornadaTab})</span>
            </h3>
            <p className="text-xs text-slate-500 mt-1">
              Cálculo secuencial de bloques de 45 minutos y recesos según Config.gs
            </p>
          </div>

          <div className="flex items-center space-x-3">
            {/* Shift Tabs */}
            <div className="inline-flex rounded-lg bg-slate-100 p-1 border border-slate-200">
              {(['Mañana', 'Tarde', 'Noche'] as Jornada[]).map(j => (
                <button
                  key={j}
                  onClick={() => setActiveJornadaTab(j)}
                  className={`px-3 py-1 text-xs font-bold rounded-md transition-all ${
                    activeJornadaTab === j
                      ? 'bg-white text-blue-700 shadow-2xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  {j}
                </button>
              ))}
            </div>

            {/* Day Type Toggle (Mon-Thu vs Friday) */}
            <button
              onClick={() => setIsFridayView(!isFridayView)}
              className={`px-3 py-1 text-xs font-bold rounded-lg border transition-all ${
                isFridayView
                  ? 'bg-indigo-600 text-white border-indigo-700'
                  : 'bg-slate-50 text-slate-700 border-slate-300 hover:bg-slate-100'
              }`}
            >
              {isFridayView ? '✓ Horario Viernes' : 'Lunes a Jueves'}
            </button>
          </div>
        </div>

        {/* Schedule Visual Timeline */}
        <div className="mt-6 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
          {scheduleBlocks.map((block, idx) => {
            const isBlock = block.type === 'BLOCK';
            return (
              <div
                key={idx}
                className={`p-4 rounded-xl border transition-all ${
                  isBlock
                    ? 'bg-blue-50/60 border-blue-200'
                    : 'bg-amber-50/60 border-amber-200 border-dashed'
                }`}
              >
                <div className="flex items-center justify-between text-xs font-bold">
                  <span className={isBlock ? 'text-blue-900' : 'text-amber-900'}>
                    {block.label}
                  </span>
                  <span className="text-xs font-mono font-medium text-slate-500">
                    {block.minutes} min
                  </span>
                </div>
                <div className="mt-2 flex items-center space-x-1.5 text-sm font-bold font-mono text-slate-800">
                  <Clock className="w-4 h-4 text-slate-400" />
                  <span>
                    {block.startTime} — {block.endTime}
                  </span>
                </div>
                <p className="text-2xs text-slate-500 mt-1">
                  {isBlock
                    ? 'Horario lectivo de docencia'
                    : 'Pausa intermedia institucional'}
                </p>
              </div>
            );
          })}
        </div>

        <div className="mt-4 p-3 bg-slate-50 rounded-xl border border-slate-200 text-xs text-slate-600 flex items-center space-x-2">
          <AlertCircle className="w-4 h-4 text-blue-600 shrink-0" />
          <span>
            {isFridayView
              ? 'El viernes consta de 4 bloques lectivos y 2 recesos de 10 min. El receso final concluye la permanencia escolar.'
              : 'De lunes a jueves la jornada cuenta con 5 bloques de 45 min y dos recesos (10 y 5 min).'}
          </span>
        </div>
      </div>

      {/* Change Jornada Modal */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-xs p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-xl border border-slate-200">
            <h3 className="text-lg font-bold text-slate-900">
              Modificar Jornada del Curso
            </h3>
            <p className="text-xs text-slate-500 mt-1">
              Esta modificación es autorizada solo para el perfil Administrador. Los registros de asistencia anteriores conservarán su jornada de registro histórica.
            </p>

            {notification && (
              <div
                className={`mt-4 p-3 rounded-lg text-xs font-medium flex items-center space-x-2 ${
                  notification.type === 'success'
                    ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                    : 'bg-rose-50 text-rose-800 border border-rose-200'
                }`}
              >
                {notification.type === 'success' ? (
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                ) : (
                  <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
                )}
                <span>{notification.message}</span>
              </div>
            )}

            <form onSubmit={handleConfirmChange} className="mt-4 space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700">
                  Curso Seleccionado
                </label>
                <div className="mt-1 p-2.5 bg-slate-100 rounded-lg text-xs font-bold text-slate-800">
                  {courses.find(c => c.id_nivel === selectedCourseId)?.nombre_nivel} ({selectedCourseId})
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700">
                  Nueva Jornada
                </label>
                <select
                  value={targetJornada}
                  onChange={e => setTargetJornada(e.target.value as Jornada)}
                  className="mt-1 w-full text-xs font-bold bg-slate-50 border border-slate-300 rounded-lg p-2 text-slate-800 focus:ring-2 focus:ring-blue-500"
                >
                  <option value="Mañana">Mañana (09:00 - 13:00 / Vie 12:10)</option>
                  <option value="Tarde">Tarde (14:30 - 18:30 / Vie 17:40)</option>
                  <option value="Noche">Noche (19:00 - 23:00 / Vie 22:10)</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700">
                  Motivo del Cambio (requerido para Auditoría)
                </label>
                <textarea
                  rows={3}
                  required
                  value={changeReason}
                  onChange={e => setChangeReason(e.target.value)}
                  placeholder="Ej: Reasignación de infraestructura por mantenimiento de salas..."
                  className="mt-1 w-full text-xs bg-slate-50 border border-slate-300 rounded-lg p-2 text-slate-800 focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div className="flex items-center justify-end space-x-3 pt-2">
                <button
                  type="button"
                  onClick={() => setModalOpen(false)}
                  className="px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-100 rounded-lg"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 text-xs font-bold bg-blue-600 hover:bg-blue-700 text-white rounded-lg shadow-xs"
                >
                  Confirmar Cambio
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
