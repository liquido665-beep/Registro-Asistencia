import React, { useState } from 'react';
import { useApp } from '../context/AppContext';
import {
  ShieldCheck,
  Search,
  Filter,
  Clock,
  User,
  Database,
  Tag,
  FileText
} from 'lucide-react';

export const AuditView: React.FC = () => {
  const { auditLog } = useApp();
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [selectedAction, setSelectedAction] = useState<string>('TODAS');

  // Unique actions for filter
  const actionList = Array.from(new Set(auditLog.map(a => a.accion)));

  const filtered = auditLog.filter(entry => {
    const matchesAction = selectedAction === 'TODAS' || entry.accion === selectedAction;
    const term = searchTerm.toLowerCase();
    const matchesSearch =
      entry.usuario.toLowerCase().includes(term) ||
      entry.id_registro.toLowerCase().includes(term) ||
      entry.detalle.toLowerCase().includes(term) ||
      entry.tabla_afectada.toLowerCase().includes(term);

    return matchesAction && matchesSearch;
  });

  const getActionBadge = (accion: string) => {
    if (accion.includes('REGISTRO') || accion.includes('ASISTENCIA')) {
      return 'bg-blue-100 text-blue-800 border-blue-200';
    }
    if (accion.includes('APROBAR')) {
      return 'bg-emerald-100 text-emerald-800 border-emerald-200';
    }
    if (accion.includes('RECHAZAR')) {
      return 'bg-rose-100 text-rose-800 border-rose-200';
    }
    if (accion.includes('CAMBIAR_JORNADA')) {
      return 'bg-purple-100 text-purple-800 border-purple-200';
    }
    return 'bg-slate-100 text-slate-800 border-slate-200';
  };

  return (
    <div className="space-y-6">
      <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-xs flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center space-x-2">
            <ShieldCheck className="w-6 h-6 text-purple-600" />
            <h2 className="text-xl font-bold text-slate-900">
              Bitácora de Auditoría del Sistema
            </h2>
          </div>
          <p className="text-xs text-slate-500 mt-1 max-w-2xl">
            Registro cronológico inmutable de todas las operaciones: tomas de asistencia, aprobaciones de justificativo, modificaciones de jornada y eventos de integración.
          </p>
        </div>

        <div className="text-xs bg-slate-50 px-3 py-1.5 rounded-xl border border-slate-200 text-slate-600 font-medium">
          Total eventos registrados: <span className="font-bold text-slate-900">{auditLog.length}</span>
        </div>
      </div>

      {/* Filters Toolbar */}
      <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs flex flex-col sm:flex-row items-center justify-between gap-3">
        <div className="relative w-full sm:w-72">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
          <input
            type="text"
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
            placeholder="Buscar por usuario, ID, tabla..."
            className="w-full text-xs pl-9 pr-3 py-2 bg-slate-50 border border-slate-300 rounded-lg text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>

        <div className="flex items-center space-x-2 w-full sm:w-auto">
          <Filter className="w-4 h-4 text-slate-500 shrink-0" />
          <span className="text-xs text-slate-500">Acción:</span>
          <select
            value={selectedAction}
            onChange={e => setSelectedAction(e.target.value)}
            className="text-xs bg-slate-50 border border-slate-300 rounded-lg px-2.5 py-1.5 text-slate-800 font-medium cursor-pointer"
          >
            <option value="TODAS">Todas las acciones</option>
            {actionList.map(a => (
              <option key={a} value={a}>
                {a}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Audit Log Table */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-slate-200 text-slate-500 text-xs uppercase tracking-wider bg-slate-50">
                <th className="py-3 px-4 font-semibold">ID Evento</th>
                <th className="py-3 px-4 font-semibold">Fecha y Hora</th>
                <th className="py-3 px-4 font-semibold">Usuario Responsable</th>
                <th className="py-3 px-4 font-semibold">Acción</th>
                <th className="py-3 px-4 font-semibold">Tabla & ID</th>
                <th className="py-3 px-4 font-semibold">Detalle de la Operación</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-sm">
              {filtered.map(entry => (
                <tr key={entry.id_evento} className="hover:bg-slate-50/70 transition-colors">
                  <td className="py-3 px-4 font-mono text-2xs font-bold text-slate-400">
                    {entry.id_evento}
                  </td>
                  <td className="py-3 px-4 text-xs font-mono text-slate-600 whitespace-nowrap">
                    <div className="flex items-center space-x-1.5">
                      <Clock className="w-3.5 h-3.5 text-slate-400" />
                      <span>{entry.timestamp}</span>
                    </div>
                  </td>
                  <td className="py-3 px-4 text-xs font-medium text-slate-800">
                    <div className="flex items-center space-x-1.5">
                      <User className="w-3.5 h-3.5 text-slate-400" />
                      <span>{entry.usuario}</span>
                    </div>
                  </td>
                  <td className="py-3 px-4">
                    <span
                      className={`inline-flex items-center px-2 py-0.5 rounded-full text-2xs font-extrabold border ${getActionBadge(
                        entry.accion
                      )}`}
                    >
                      {entry.accion}
                    </span>
                  </td>
                  <td className="py-3 px-4 text-xs font-mono text-slate-600">
                    <div>
                      <span className="font-semibold text-slate-700">{entry.tabla_afectada}</span>
                      <span className="text-slate-400 ml-1">[{entry.id_registro}]</span>
                    </div>
                  </td>
                  <td className="py-3 px-4 text-xs text-slate-700 max-w-md">
                    {entry.detalle}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {filtered.length === 0 && (
          <div className="p-12 text-center text-slate-400 text-sm">
            No se encontraron eventos coincidentes con los filtros seleccionados.
          </div>
        )}
      </div>
    </div>
  );
};
