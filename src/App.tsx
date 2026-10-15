import React, { useState } from 'react';
import { AppProvider } from './context/AppContext';
import { Navbar } from './components/Navbar';
import { AttendanceView } from './components/AttendanceView';
import { CoursesView } from './components/CoursesView';
import { JustificationsView } from './components/JustificationsView';
import { ReportsView } from './components/ReportsView';
import { AuditView } from './components/AuditView';
import { IntegrationInfoView } from './components/IntegrationInfoView';

export function AppContent() {
  const [currentTab, setCurrentTab] = useState<string>('asistencia');

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col">
      <Navbar currentTab={currentTab} setCurrentTab={setCurrentTab} />

      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-6">
        {currentTab === 'asistencia' && <AttendanceView />}
        {currentTab === 'cursos' && <CoursesView />}
        {currentTab === 'justificativos' && <JustificationsView />}
        {currentTab === 'reportes' && <ReportsView />}
        {currentTab === 'auditoria' && <AuditView />}
        {currentTab === 'integracion' && <IntegrationInfoView />}
      </main>

      <footer className="bg-white border-t border-slate-200 py-4 mt-8">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex flex-col sm:flex-row items-center justify-between text-xs text-slate-500 gap-2">
          <span>Sistema Integral de Gestión de Asistencia Escolar • asistencia-colegio</span>
          <span>Google Apps Script • AppSheet Webhook • React + Vite</span>
        </div>
      </footer>
    </div>
  );
}

export default function App() {
  return (
    <AppProvider>
      <AppContent />
    </AppProvider>
  );
}
