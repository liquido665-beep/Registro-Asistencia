import React from 'react';
import {
  Terminal,
  FileCode2,
  CheckCircle2,
  Layers,
  Webhook,
  Database,
  ShieldCheck,
  FolderTree,
  ExternalLink
} from 'lucide-react';

export const IntegrationInfoView: React.FC = () => {
  const gasServices = [
    { name: 'Config.gs', role: 'Configuración global, constantes de jornadas, horarios y catálogo' },
    { name: 'AttendanceService.gs', role: 'Toma individual y masiva de asistencia con validación de horas' },
    { name: 'ScheduleService.gs', role: 'Cálculo de bloques de 45 min y recesos por jornada y día' },
    { name: 'JustificationService.gs', role: 'Gestión de licencias y actualización automática a Justificado' },
    { name: 'CourseService.gs', role: 'Catálogo de cursos (Niveles) y cambio de jornada (Admin)' },
    { name: 'ReportService.gs', role: 'Generación de reportes y detección de alumnos con asistencia < 85%' },
    { name: 'SummaryService.gs', role: 'Resumen semanal consolidado por jornada e inserción idempotente' },
    { name: 'AuditService.gs', role: 'Bitácora inmutable de eventos y monitoreo de ediciones en planilla' },
    { name: 'Webhook.gs', role: 'Endpoint doPost(e) con autenticación por token para AppSheet' },
    { name: 'ValidationService.gs', role: 'Validación estructural e integridad de encabezados requeridos' },
    { name: 'Triggers.gs', role: 'Disparadores de resumen semanal (Viernes 22:40) y auditoría onEdit' }
  ];

  const webhookEvents = [
    { event: 'ASISTENCIA_REGISTRAR', roles: 'Administrador, Docente, Inspector' },
    { event: 'ASISTENCIA_ACTUALIZAR', roles: 'Administrador, Docente, Inspector' },
    { event: 'CURSO_CAMBIAR_JORNADA', roles: 'Administrador (Exclusivo)' },
    { event: 'JUSTIFICATIVO_SOLICITAR', roles: 'Administrador, Inspector' },
    { event: 'JUSTIFICATIVO_ACTUALIZAR', roles: 'Administrador, Inspector, Directivo' }
  ];

  return (
    <div className="space-y-6">
      {/* Top Banner */}
      <div className="bg-slate-900 text-white p-6 rounded-2xl shadow-xs">
        <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
          <div>
            <div className="flex items-center space-x-2">
              <Terminal className="w-6 h-6 text-emerald-400" />
              <h2 className="text-xl font-bold">
                Hub de Integración: Google Apps Script & AppSheet
              </h2>
            </div>
            <p className="text-sm text-slate-300 mt-1 max-w-2xl">
              Arquitectura institucional dual: los servicios de backend y reglas de negocio residen en Apps Script y Google Sheets, interactuando con AppSheet mediante webhook y con esta aplicación web Vite + React.
            </p>
          </div>

          <div className="flex items-center space-x-2 bg-emerald-500/10 border border-emerald-500/30 px-3.5 py-2 rounded-xl text-emerald-400 text-xs font-bold">
            <CheckCircle2 className="w-4 h-4" />
            <span>110 / 110 Pruebas Automáticas Pasadas</span>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* GAS Modules Card */}
        <div className="bg-white rounded-2xl border border-slate-200 shadow-xs p-6">
          <h3 className="font-bold text-slate-900 text-base mb-4 flex items-center space-x-2">
            <FileCode2 className="w-5 h-5 text-blue-600" />
            <span>Módulos de Google Apps Script (src/*.gs)</span>
          </h3>

          <div className="divide-y divide-slate-100 text-xs max-h-96 overflow-y-auto pr-1">
            {gasServices.map(srv => (
              <div key={srv.name} className="py-2.5 flex items-start space-x-3">
                <code className="bg-blue-50 text-blue-800 font-bold px-2 py-0.5 rounded border border-blue-200 shrink-0 font-mono">
                  {srv.name}
                </code>
                <span className="text-slate-600">{srv.role}</span>
              </div>
            ))}
          </div>

          <div className="mt-4 pt-4 border-t border-slate-100 flex items-center justify-between text-2xs text-slate-500 font-mono">
            <span>Runtime: V8 Engine</span>
            <span>Zona Horaria: America/Santiago</span>
          </div>
        </div>

        {/* Webhook & Sheets Schema */}
        <div className="space-y-6">
          {/* Webhook Contract */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-xs p-6">
            <h3 className="font-bold text-slate-900 text-base mb-3 flex items-center space-x-2">
              <Webhook className="w-5 h-5 text-purple-600" />
              <span>Contrato Webhook AppSheet (doPost)</span>
            </h3>
            <p className="text-xs text-slate-500 mb-3">
              Permisos estrictos compartidos entre las reglas de Apps Script y el Webhook:
            </p>

            <div className="space-y-2 text-xs">
              {webhookEvents.map(we => (
                <div
                  key={we.event}
                  className="p-2.5 rounded-lg bg-slate-50 border border-slate-200 flex items-center justify-between"
                >
                  <code className="font-bold text-purple-900 font-mono">{we.event}</code>
                  <span className="text-2xs font-semibold px-2 py-0.5 rounded bg-purple-100 text-purple-800">
                    {we.roles}
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* Sheets Database Structure */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-xs p-6">
            <h3 className="font-bold text-slate-900 text-base mb-2 flex items-center space-x-2">
              <Database className="w-5 h-5 text-emerald-600" />
              <span>Pestañas de Google Sheets (Base de Datos)</span>
            </h3>
            <p className="text-xs text-slate-500 mb-3">
              Estructura no destructiva validada por <code>SchemaService.gs</code>:
            </p>
            <div className="flex flex-wrap gap-1.5 text-xs">
              {[
                'Usuarios',
                'Niveles',
                'Estudiantes',
                'Asignaciones',
                'Asistencias',
                'Justificativos',
                'Auditoria',
                'Resumenes',
                'Configuracion',
                'App_Transacciones',
                'App_Solicitudes'
              ].map(sheet => (
                <span
                  key={sheet}
                  className="px-2.5 py-1 bg-slate-100 text-slate-700 font-mono text-2xs rounded-md border border-slate-200"
                >
                  {sheet}
                </span>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
