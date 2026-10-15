import React from 'react';
import { useApp } from '../context/AppContext';
import {
  GraduationCap,
  CalendarCheck,
  BookOpen,
  FileCheck2,
  BarChart3,
  ShieldCheck,
  Terminal,
  UserCheck,
  RotateCcw
} from 'lucide-react';

interface NavbarProps {
  currentTab: string;
  setCurrentTab: (tab: string) => void;
}

export const Navbar: React.FC<NavbarProps> = ({ currentTab, setCurrentTab }) => {
  const { currentUser, setCurrentUser, users, resetToDefaults } = useApp();

  const navItems = [
    { id: 'asistencia', label: 'Asistencia', icon: CalendarCheck },
    { id: 'cursos', label: 'Cursos y Jornadas', icon: BookOpen },
    { id: 'justificativos', label: 'Justificativos', icon: FileCheck2 },
    { id: 'reportes', label: 'Reportes y Alertas', icon: BarChart3 },
    { id: 'auditoria', label: 'Auditoría', icon: ShieldCheck },
    { id: 'integracion', label: 'Hub Google Apps Script / AppSheet', icon: Terminal }
  ];

  const getRoleBadgeColor = (role: string) => {
    switch (role) {
      case 'Administrador':
        return 'bg-purple-100 text-purple-800 border-purple-200';
      case 'Docente':
        return 'bg-blue-100 text-blue-800 border-blue-200';
      case 'Directivo':
        return 'bg-amber-100 text-amber-800 border-amber-200';
      case 'Inspector':
        return 'bg-emerald-100 text-emerald-800 border-emerald-200';
      default:
        return 'bg-slate-100 text-slate-800 border-slate-200';
    }
  };

  return (
    <header className="bg-white border-b border-slate-200 shadow-xs sticky top-0 z-30">
      {/* Top bar with institution info and role switcher */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 rounded-xl bg-blue-600 flex items-center justify-center text-white shadow-sm">
              <GraduationCap className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <h1 className="text-lg font-bold text-slate-900 leading-tight">
                  Sistema de Asistencia Escolar
                </h1>
                <span className="text-xs px-2 py-0.5 rounded-md bg-slate-100 text-slate-600 font-medium">
                  v2.0
                </span>
              </div>
              <p className="text-xs text-slate-500">
                Gestión Académica • Jornadas Mañana, Tarde y Noche
              </p>
            </div>
          </div>

          <div className="flex items-center space-x-4">
            {/* Role / User Switcher */}
            <div className="flex items-center space-x-2 bg-slate-50 p-1.5 rounded-xl border border-slate-200">
              <UserCheck className="w-4 h-4 text-slate-500 ml-1.5" />
              <span className="text-xs font-medium text-slate-600 hidden sm:inline">
                Simular Rol:
              </span>
              <select
                value={currentUser.id_usuario}
                onChange={e => {
                  const selected = users.find(u => u.id_usuario === e.target.value);
                  if (selected) setCurrentUser(selected);
                }}
                className="text-xs font-semibold bg-white border border-slate-300 rounded-lg px-2.5 py-1 text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500 cursor-pointer"
              >
                {users.map(u => (
                  <option key={u.id_usuario} value={u.id_usuario}>
                    {u.nombre_completo} ({u.rol})
                  </option>
                ))}
              </select>
              <span
                className={`text-xs px-2 py-0.5 rounded-full border font-medium ${getRoleBadgeColor(
                  currentUser.rol
                )}`}
              >
                {currentUser.rol}
              </span>
            </div>

            <button
              onClick={() => {
                if (window.confirm('¿Reiniciar los datos de prueba a los valores iniciales?')) {
                  resetToDefaults();
                }
              }}
              title="Restaurar datos de prueba"
              className="p-2 text-slate-500 hover:text-slate-800 hover:bg-slate-100 rounded-lg transition-colors"
            >
              <RotateCcw className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>

      {/* Navigation tabs */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <nav className="flex space-x-1 sm:space-x-4 overflow-x-auto py-2">
          {navItems.map(item => {
            const Icon = item.icon;
            const isActive = currentTab === item.id;
            return (
              <button
                key={item.id}
                onClick={() => setCurrentTab(item.id)}
                className={`flex items-center space-x-2 px-3 py-2 text-sm font-medium rounded-lg transition-all whitespace-nowrap ${
                  isActive
                    ? 'bg-blue-600 text-white shadow-xs'
                    : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
                }`}
              >
                <Icon className={`w-4 h-4 ${isActive ? 'text-white' : 'text-slate-500'}`} />
                <span>{item.label}</span>
              </button>
            );
          })}
        </nav>
      </div>
    </header>
  );
};
