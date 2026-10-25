import { Menu } from 'lucide-react';
import type { Route } from '../App';

const TITLES: Record<Route, string> = {
  dashboard: 'لوحة التحكم',
  patients: 'إدارة المرضى',
  appointments: 'إدارة المواعيد',
  services: 'إدارة الخدمات',
  invoices: 'إدارة الفواتير',
  api: 'جدول البيانات (API)',
  settings: 'الإعدادات',
};

export function Topbar({ route, onToggleSidebar }: { route: Route; onToggleSidebar: () => void }) {
  return (
    <header className="sticky top-0 z-20 flex h-16 items-center gap-3 border-b border-slate-100 bg-white/80 px-4 backdrop-blur sm:px-6">
      <button onClick={onToggleSidebar} className="rounded-lg p-2 text-slate-600 hover:bg-slate-100 lg:hidden">
        <Menu className="h-5 w-5" />
      </button>
      <h1 className="text-lg font-bold text-slate-800">{TITLES[route]}</h1>
    </header>
  );
}
