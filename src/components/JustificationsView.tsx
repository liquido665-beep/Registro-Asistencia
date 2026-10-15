import React, { useState } from 'react';
import { useApp } from '../context/AppContext';
import { JustificationType, ApprovalStatus } from '../types';
import {
  FileCheck2,
  Plus,
  CheckCircle2,
  XCircle,
  Clock,
  ExternalLink,
  ShieldCheck,
  Calendar,
  AlertCircle,
  FileText,
  User
} from 'lucide-react';

export const JustificationsView: React.FC = () => {
  const {
    currentUser,
    justifications,
    students,
    courses,
    createJustification,
    approveJustification,
    rejectJustification
  } = useApp();

  const [activeFilter, setActiveFilter] = useState<'Todos' | ApprovalStatus>('Todos');
  const [modalOpen, setModalOpen] = useState<boolean>(false);
  const [rejectModalOpen, setRejectModalOpen] = useState<boolean>(false);
  const [selectedJustId, setSelectedJustId] = useState<string>('');
  const [rejectReason, setRejectReason] = useState<string>('');
  const [notification, setNotification] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  // Form states for new justification
  const [studentId, setStudentId] = useState<string>(students[0]?.id_estudiante || '');
  const [startDate, setStartDate] = useState<string>('2026-10-14');
  const [endDate, setEndDate] = useState<string>('2026-10-15');
  const [tipo, setTipo] = useState<JustificationType>('Médico');
  const [motivo, setMotivo] = useState<string>('');
  const [fileUrl, setFileUrl] = useState<string>('');

  const canCreate = currentUser.rol === 'Administrador' || currentUser.rol === 'Inspector';
  const canReview =
    currentUser.rol === 'Administrador' ||
    currentUser.rol === 'Directivo' ||
    currentUser.rol === 'Inspector';

  const filteredJustifications = justifications.filter(j => {
    if (activeFilter === 'Todos') return true;
    return j.estado_aprobacion === activeFilter;
  });

  const handleCreateSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!motivo.trim()) {
      setNotification({ type: 'error', message: 'Debe ingresar el motivo detallado.' });
      return;
    }

    const res = createJustification({
      studentId,
      startDate,
      endDate,
      tipo,
      motivo,
      fileUrl: fileUrl || `https://drive.google.com/file/d/justificativo-${studentId}`
    });

    if (res.success) {
      setNotification({ type: 'success', message: res.message });
      setMotivo('');
      setFileUrl('');
      setTimeout(() => setModalOpen(false), 1000);
    } else {
      setNotification({ type: 'error', message: res.message });
    }
  };

  const handleApprove = (justId: string) => {
    const res = approveJustification(justId);
    if (res.success) {
      setNotification({ type: 'success', message: res.message });
    } else {
      setNotification({ type: 'error', message: res.message });
    }
  };

  const handleOpenReject = (justId: string) => {
    setSelectedJustId(justId);
    setRejectReason('');
    setRejectModalOpen(true);
  };

  const handleConfirmReject = (e: React.FormEvent) => {
    e.preventDefault();
    const res = rejectJustification(selectedJustId, rejectReason);
    if (res.success) {
      setNotification({ type: 'success', message: res.message });
      setRejectModalOpen(false);
    } else {
      setNotification({ type: 'error', message: res.message });
    }
  };

  return (
    <div className="space-y-6">
      {/* Header and Action */}
      <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-xs flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center space-x-2">
            <FileCheck2 className="w-6 h-6 text-blue-600" />
            <h2 className="text-xl font-bold text-slate-900">
              Gestión de Justificativos Escolares
            </h2>
          </div>
          <p className="text-xs text-slate-500 mt-1 max-w-2xl">
            Registro, validación de certificados y sincronización automática a las listas de asistencia tras su aprobación institucional.
          </p>
        </div>

        <div className="flex items-center space-x-3">
          {canCreate ? (
            <button
              onClick={() => {
                setNotification(null);
                setModalOpen(true);
              }}
              className="flex items-center space-x-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold rounded-xl shadow-xs transition-colors"
            >
              <Plus className="w-4 h-4" />
              <span>Nuevo Justificativo</span>
            </button>
          ) : (
            <div className="text-xs text-slate-500 bg-slate-50 px-3 py-2 rounded-xl border border-slate-200">
              Creación reservada a Inspectoría o Administrador
            </div>
          )}
        </div>
      </div>

      {notification && (
        <div
          className={`p-4 rounded-xl border flex items-center space-x-3 text-sm ${
            notification.type === 'success'
              ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
              : 'bg-rose-50 border-rose-200 text-rose-800'
          }`}
        >
          {notification.type === 'success' ? (
            <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
          ) : (
            <AlertCircle className="w-5 h-5 text-rose-600 shrink-0" />
          )}
          <span className="font-medium">{notification.message}</span>
        </div>
      )}

      {/* Filter tabs */}
      <div className="flex space-x-2 border-b border-slate-200 pb-2">
        {(['Todos', 'Pendiente', 'Aprobado', 'Rechazado'] as const).map(tab => (
          <button
            key={tab}
            onClick={() => setActiveFilter(tab)}
            className={`px-3.5 py-1.5 text-xs font-bold rounded-lg transition-colors ${
              activeFilter === tab
                ? 'bg-slate-900 text-white'
                : 'bg-white text-slate-600 hover:bg-slate-100 border border-slate-200'
            }`}
          >
            {tab}
            <span className="ml-1.5 text-2xs opacity-75">
              (
              {tab === 'Todos'
                ? justifications.length
                : justifications.filter(j => j.estado_aprobacion === tab).length}
              )
            </span>
          </button>
        ))}
      </div>

      {/* Justifications Cards Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {filteredJustifications.map(just => {
          const student = students.find(s => s.id_estudiante === just.id_estudiante);
          const course = courses.find(c => c.id_nivel === student?.id_nivel);

          const isPending = just.estado_aprobacion === 'Pendiente';
          const isApproved = just.estado_aprobacion === 'Aprobado';
          const isRejected = just.estado_aprobacion === 'Rechazado';

          return (
            <div
              key={just.id_justificativo}
              className="bg-white rounded-2xl border border-slate-200 shadow-xs p-5 flex flex-col justify-between hover:border-slate-300 transition-all"
            >
              <div>
                <div className="flex items-start justify-between">
                  <div>
                    <span className="text-2xs font-mono font-bold text-slate-400 uppercase">
                      {just.id_justificativo}
                    </span>
                    <h3 className="font-bold text-slate-900 text-base mt-0.5">
                      {student ? `${student.nombres} ${student.apellidos}` : just.id_estudiante}
                    </h3>
                    <p className="text-xs text-slate-500">
                      {course?.nombre_nivel || 'Curso no identificado'} • RUT: {student?.rut_dni}
                    </p>
                  </div>

                  {/* Status Badge */}
                  <span
                    className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-bold border ${
                      isApproved
                        ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                        : isPending
                        ? 'bg-amber-50 text-amber-800 border-amber-200'
                        : 'bg-rose-50 text-rose-800 border-rose-200'
                    }`}
                  >
                    {isApproved && <CheckCircle2 className="w-3.5 h-3.5 mr-1" />}
                    {isPending && <Clock className="w-3.5 h-3.5 mr-1" />}
                    {isRejected && <XCircle className="w-3.5 h-3.5 mr-1" />}
                    {just.estado_aprobacion}
                  </span>
                </div>

                <div className="mt-4 pt-3 border-t border-slate-100 space-y-2 text-xs">
                  <div className="flex items-center justify-between">
                    <span className="text-slate-500 font-medium">Período de Ausencia:</span>
                    <span className="font-bold font-mono text-slate-800">
                      {just.fecha_inicio} al {just.fecha_fin}
                    </span>
                  </div>

                  <div className="flex items-center justify-between">
                    <span className="text-slate-500 font-medium">Tipo de Causal:</span>
                    <span className="font-semibold px-2 py-0.5 rounded bg-slate-100 text-slate-700">
                      {just.tipo}
                    </span>
                  </div>

                  <div className="mt-2 bg-slate-50 p-2.5 rounded-xl border border-slate-100 text-slate-700">
                    <span className="font-semibold block text-2xs text-slate-400 uppercase mb-0.5">
                      Motivo / Diagnóstico
                    </span>
                    <p className="italic">{just.motivo}</p>
                  </div>

                  {just.url_archivo_drive && (
                    <div className="pt-1">
                      <a
                        href={just.url_archivo_drive}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center space-x-1.5 text-blue-600 hover:text-blue-800 font-medium text-xs hover:underline"
                      >
                        <FileText className="w-3.5 h-3.5" />
                        <span>Ver Certificado Adjunto (Drive)</span>
                        <ExternalLink className="w-3 h-3" />
                      </a>
                    </div>
                  )}
                </div>
              </div>

              {/* Footer with Registrado por and Approver Actions */}
              <div className="mt-5 pt-3 border-t border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-2xs text-slate-500">
                <div>
                  <span>Ingresado por: {just.registrado_por}</span>
                  {just.aprobado_por && <div className="font-medium text-slate-700">Aprobado por: {just.aprobado_por}</div>}
                </div>

                {isPending && canReview && (
                  <div className="flex items-center space-x-2">
                    <button
                      type="button"
                      onClick={() => handleOpenReject(just.id_justificativo)}
                      className="px-3 py-1.5 font-bold text-xs bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 rounded-lg transition-colors"
                    >
                      Rechazar
                    </button>
                    <button
                      type="button"
                      onClick={() => handleApprove(just.id_justificativo)}
                      className="px-3 py-1.5 font-bold text-xs bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg shadow-2xs transition-colors"
                    >
                      Aprobar y Sincronizar
                    </button>
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {filteredJustifications.length === 0 && (
        <div className="bg-white p-12 text-center rounded-2xl border border-slate-200 text-slate-500">
          <FileCheck2 className="w-12 h-12 mx-auto text-slate-300 mb-2" />
          <p className="font-medium">No hay justificativos registrados en este estado.</p>
        </div>
      )}

      {/* New Justification Modal */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-xs p-4">
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-xl border border-slate-200 max-h-[90vh] overflow-y-auto">
            <h3 className="text-lg font-bold text-slate-900">
              Registrar Nuevo Justificativo
            </h3>
            <p className="text-xs text-slate-500 mt-1">
              Al aprobarse, el sistema actualizará automáticamente a "Justificado" los días del estudiante dentro del rango.
            </p>

            <form onSubmit={handleCreateSubmit} className="mt-5 space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700">
                  Estudiante
                </label>
                <select
                  value={studentId}
                  onChange={e => setStudentId(e.target.value)}
                  className="mt-1 w-full text-xs font-semibold bg-slate-50 border border-slate-300 rounded-lg p-2.5 text-slate-800 focus:ring-2 focus:ring-blue-500"
                >
                  {students.map(s => {
                    const c = courses.find(cr => cr.id_nivel === s.id_nivel);
                    return (
                      <option key={s.id_estudiante} value={s.id_estudiante}>
                        {s.nombres} {s.apellidos} ({s.rut_dni}) • {c?.nombre_nivel}
                      </option>
                    );
                  })}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700">
                    Fecha Inicio
                  </label>
                  <input
                    type="date"
                    required
                    value={startDate}
                    onChange={e => setStartDate(e.target.value)}
                    className="mt-1 w-full text-xs bg-slate-50 border border-slate-300 rounded-lg p-2 text-slate-800"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700">
                    Fecha Término
                  </label>
                  <input
                    type="date"
                    required
                    value={endDate}
                    onChange={e => setEndDate(e.target.value)}
                    className="mt-1 w-full text-xs bg-slate-50 border border-slate-300 rounded-lg p-2 text-slate-800"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700">
                  Tipo de Justificativo
                </label>
                <select
                  value={tipo}
                  onChange={e => setTipo(e.target.value as JustificationType)}
                  className="mt-1 w-full text-xs font-semibold bg-slate-50 border border-slate-300 rounded-lg p-2.5 text-slate-800"
                >
                  <option value="Médico">Médico (Licencia médica / Certificado doctor)</option>
                  <option value="Personal">Personal (Fuerza mayor familiar)</option>
                  <option value="Gendarmería">Gendarmería / Legal</option>
                  <option value="Otros">Otros</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700">
                  Motivo / Observación
                </label>
                <textarea
                  rows={3}
                  required
                  value={motivo}
                  onChange={e => setMotivo(e.target.value)}
                  placeholder="Detalle de la causal médica o motivo justificado..."
                  className="mt-1 w-full text-xs bg-slate-50 border border-slate-300 rounded-lg p-2 text-slate-800 focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700">
                  URL del Documento en Google Drive (Opcional)
                </label>
                <input
                  type="url"
                  value={fileUrl}
                  onChange={e => setFileUrl(e.target.value)}
                  placeholder="https://drive.google.com/file/d/..."
                  className="mt-1 w-full text-xs bg-slate-50 border border-slate-300 rounded-lg p-2 text-slate-800"
                />
              </div>

              <div className="flex items-center justify-end space-x-3 pt-3 border-t border-slate-100">
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
                  Guardar Solicitud
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Reject Modal */}
      {rejectModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-xs p-4">
          <div className="bg-white rounded-2xl max-w-sm w-full p-6 shadow-xl border border-slate-200">
            <h3 className="text-base font-bold text-slate-900">
              Rechazar Justificativo
            </h3>
            <p className="text-xs text-slate-500 mt-1">
              Ingrese la razón del rechazo para la bitácora de auditoría.
            </p>

            <form onSubmit={handleConfirmReject} className="mt-4 space-y-4">
              <div>
                <textarea
                  rows={3}
                  required
                  value={rejectReason}
                  onChange={e => setRejectReason(e.target.value)}
                  placeholder="Ej: Documento no legible o fecha fuera de plazo legal..."
                  className="w-full text-xs bg-slate-50 border border-slate-300 rounded-lg p-2 text-slate-800"
                />
              </div>

              <div className="flex items-center justify-end space-x-2">
                <button
                  type="button"
                  onClick={() => setRejectModalOpen(false)}
                  className="px-3 py-1.5 text-xs font-bold text-slate-600 hover:bg-slate-100 rounded-lg"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-3 py-1.5 text-xs font-bold bg-rose-600 hover:bg-rose-700 text-white rounded-lg"
                >
                  Confirmar Rechazo
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
