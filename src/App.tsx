import { useEffect, useState, useCallback } from 'react';
import { supabase } from './lib/supabase';
import type { Settings } from './lib/types';
import { Sidebar } from './components/Sidebar';
import { Topbar } from './components/Topbar';
import { Dashboard } from './pages/Dashboard';
import { Patients } from './pages/Patients';
import { Appointments } from './pages/Appointments';
import { Services } from './pages/Services';
import { Invoices } from './pages/Invoices';
import { SettingsPage } from './pages/SettingsPage';
import { ApiTable } from './pages/ApiTable';
import { ToastProvider } from './components/Toast';

export type Route = 'dashboard' | 'patients' | 'appointments' | 'services' | 'invoices' | 'api' | 'settings';

export default function App() {
  const [route, setRoute] = useState<Route>(() => {
    const hash = window.location.hash.replace('#/', '') as Route;
    return (['dashboard', 'patients', 'appointments', 'services', 'invoices', 'api', 'settings'] as Route[]).includes(hash)
      ? hash
      : 'dashboard';
  });
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [settings, setSettings] = useState<Settings | null>(null);

  useEffect(() => {
    const onHash = () => {
      const hash = window.location.hash.replace('#/', '') as Route;
      if ((['dashboard', 'patients', 'appointments', 'services', 'invoices', 'api', 'settings'] as Route[]).includes(hash)) {
        setRoute(hash);
      } else {
        setRoute('dashboard');
      }
    };
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);

  const navigate = useCallback((r: Route) => {
    window.location.hash = `/${r}`;
    setRoute(r);
    setSidebarOpen(false);
  }, []);

  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from('settings')
        .select('*')
        .eq('id', 1)
        .maybeSingle();
      if (data) setSettings(data as Settings);
    })();
  }, []);

  const renderPage = () => {
    switch (route) {
      case 'dashboard':
        return <Dashboard onNavigate={navigate} />;
      case 'patients':
        return <Patients />;
      case 'appointments':
        return <Appointments />;
      case 'services':
        return <Services />;
      case 'invoices':
        return <Invoices />;
      case 'api':
        return <ApiTable settings={settings} />;
      case 'settings':
        return <SettingsPage settings={settings} setSettings={setSettings} />;
    }
  };

  return (
    <ToastProvider>
      <div className="flex min-h-screen bg-slate-50">
        <div
          className={`fixed inset-0 z-30 bg-slate-900/40 transition-opacity lg:hidden ${
            sidebarOpen ? 'opacity-100' : 'pointer-events-none opacity-0'
          }`}
          onClick={() => setSidebarOpen(false)}
        />
        <Sidebar
          route={route}
          onNavigate={navigate}
          open={sidebarOpen}
          onClose={() => setSidebarOpen(false)}
          clinicName={settings?.clinic_name ?? 'عيادة الابتسامة'}
        />
        <div className="flex flex-1 flex-col lg:mr-64">
          <Topbar route={route} onToggleSidebar={() => setSidebarOpen(true)} />
          <main className="flex-1 p-4 sm:p-6 lg:p-8">
            <div className="animate-fade-in">{renderPage()}</div>
          </main>
          <footer className="px-6 py-4 text-center text-xs text-slate-400">
            عيادة الابتسامة — نظام إدارة عيادة الأسنان
          </footer>
        </div>
      </div>
    </ToastProvider>
  );
}
