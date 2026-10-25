import { LayoutDashboard, Users, CalendarDays, Stethoscope, Receipt, Settings as SettingsIcon, X, Smile, Table2 } from 'lucide-react';
import type { Route } from '../App';

const NAV: { route: Route; label: string; icon: typeof Users }[] = [
  { route: 'dashboard', label: 'لوحة التحكم', icon: LayoutDashboard },
  { route: 'patients', label: 'المرضى', icon: Users },
  { route: 'appointments', label: 'المواعيد', icon: CalendarDays },
  { route: 'services', label: 'الخدمات', icon: Stethoscope },
  { route: 'invoices', label: 'الفواتير', icon: Receipt },
  { route: 'api', label: 'جدول البيانات (API)', icon: Table2 },
  { route: 'settings', label: 'الإعدادات', icon: SettingsIcon },
];

export function Sidebar({
  route,
  onNavigate,
  open,
  onClose,
  clinicName,
}: {
  route: Route;
  onNavigate: (r: Route) => void;
  open: boolean;
  onClose: () => void;
  clinicName: string;
}) {
  return (
    <aside
      className={`fixed inset-y-0 right-0 z-40 w-64 transform bg-slate-900 text-slate-100 transition-transform duration-200 lg:translate-x-0 ${
        open ? 'translate-x-0' : 'translate-x-full'
      }`}
    >
      <div className="flex h-16 items-center justify-between border-b border-slate-800 px-5">
        <div className="flex items-center gap-2.5">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-teal-400 to-teal-600 text-white shadow-lg">
            <Smile className="h-6 w-6" />
          </div>
          <div className="leading-tight">
            <p className="text-sm font-bold text-white">{clinicName}</p>
            <p className="text-[11px] text-slate-400">نظام الإدارة</p>
          </div>
        </div>
        <button onClick={onClose} className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-800 lg:hidden">
          <X className="h-5 w-5" />
        </button>
      </div>

      <nav className="flex flex-col gap-1 p-3">
        {NAV.map((item) => {
          const Icon = item.icon;
          const active = route === item.route;
          return (
            <button
              key={item.route}
              onClick={() => onNavigate(item.route)}
              className={`flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-semibold transition-colors ${
                active
                  ? 'bg-teal-500/15 text-teal-300 ring-1 ring-teal-500/30'
                  : 'text-slate-300 hover:bg-slate-800 hover:text-white'
              }`}
            >
              <Icon className={`h-5 w-5 ${active ? 'text-teal-300' : 'text-slate-400'}`} />
              {item.label}
            </button>
          );
        })}
      </nav>

      <div className="absolute bottom-0 left-0 right-0 border-t border-slate-800 p-4 text-center text-[11px] text-slate-500">
        © {new Date().getFullYear()} عيادة الابتسامة
      </div>
    </aside>
  );
}
