import { useEffect, useMemo, useState } from 'react';
import { Users, CalendarDays, Receipt, TrendingUp, Stethoscope, ArrowLeft, Activity } from 'lucide-react';
import { supabase } from '../lib/supabase';
import type { AppointmentWithRelations, Invoice } from '../lib/types';
import { APPOINTMENT_STATUS_LABELS } from '../lib/types';
import { appointmentStatusClass, formatPrice, formatDateTime, formatTime } from '../lib/helpers';
import { PageLoading, EmptyState } from '../components/ui';
import type { Route } from '../App';

export function Dashboard({ onNavigate }: { onNavigate: (r: Route) => void }) {
  const [loading, setLoading] = useState(true);
  const [patientCount, setPatientCount] = useState(0);
  const [todayAppointments, setTodayAppointments] = useState<AppointmentWithRelations[]>([]);
  const [monthlyRevenue, setMonthlyRevenue] = useState(0);
  const [pendingInvoices, setPendingInvoices] = useState(0);
  const [recentAppointments, setRecentAppointments] = useState<AppointmentWithRelations[]>([]);

  useEffect(() => {
    (async () => {
      const today = new Date();
      const startOfDay = new Date(today.getFullYear(), today.getMonth(), today.getDate());
      const endOfDay = new Date(startOfDay);
      endOfDay.setDate(startOfDay.getDate() + 1);

      const monthStart = new Date(today.getFullYear(), today.getMonth(), 1);
      const monthEnd = new Date(today.getFullYear(), today.getMonth() + 1, 1);

      const [p, todayAppts, monthInv, pendingInv, recentAppts] = await Promise.all([
        supabase.from('patients').select('*', { count: 'exact', head: true }),
        supabase
          .from('appointments')
          .select('*, patient:patients(id,name,phone), service:services(id,name,duration_min,price)')
          .gte('start_time', startOfDay.toISOString())
          .lt('start_time', endOfDay.toISOString())
          .order('start_time', { ascending: true }),
        supabase
          .from('invoices')
          .select('total, paid, status')
          .gte('issued_at', monthStart.toISOString())
          .lt('issued_at', monthEnd.toISOString()),
        supabase
          .from('invoices')
          .select('*', { count: 'exact', head: true })
          .in('status', ['unpaid', 'partial']),
        supabase
          .from('appointments')
          .select('*, patient:patients(id,name,phone), service:services(id,name,duration_min,price)')
          .order('created_at', { ascending: false })
          .limit(6),
      ]);

      setPatientCount(p.count ?? 0);
      setTodayAppointments((todayAppts.data as AppointmentWithRelations[]) ?? []);
      const invData = (monthInv.data ?? []) as Pick<Invoice, 'total' | 'paid'>[];
      setMonthlyRevenue(invData.reduce((s, i) => s + (Number(i.total) || 0), 0));
      setPendingInvoices(pendingInv.count ?? 0);
      setRecentAppointments((recentAppts.data as AppointmentWithRelations[]) ?? []);
      setLoading(false);
    })();
  }, []);

  const stats = useMemo(
    () => [
      {
        label: 'إجمالي المرضى',
        value: patientCount,
        icon: Users,
        color: 'from-teal-400 to-teal-600',
        route: 'patients' as Route,
      },
      {
        label: 'مواعيد اليوم',
        value: todayAppointments.length,
        icon: CalendarDays,
        color: 'from-blue-400 to-blue-600',
        route: 'appointments' as Route,
      },
      {
        label: 'إيرادات الشهر',
        value: formatPrice(monthlyRevenue),
        icon: TrendingUp,
        color: 'from-emerald-400 to-emerald-600',
        route: 'invoices' as Route,
      },
      {
        label: 'فواتير غير مسددة',
        value: pendingInvoices,
        icon: Receipt,
        color: 'from-amber-400 to-amber-600',
        route: 'invoices' as Route,
      },
    ],
    [patientCount, todayAppointments.length, monthlyRevenue, pendingInvoices],
  );

  if (loading) return <PageLoading />;

  return (
    <div className="space-y-6">
      {/* Stats grid */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {stats.map((s) => {
          const Icon = s.icon;
          return (
            <button
              key={s.label}
              onClick={() => onNavigate(s.route)}
              className="stat-card group text-right transition-shadow hover:shadow-md"
            >
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-sm font-semibold text-slate-500">{s.label}</p>
                  <p className="mt-2 text-2xl font-extrabold text-slate-800">{s.value}</p>
                </div>
                <div className={`flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-br ${s.color} text-white shadow-md`}>
                  <Icon className="h-6 w-6" />
                </div>
              </div>
            </button>
          );
        })}
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* Today's appointments */}
        <div className="card lg:col-span-2">
          <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
            <h2 className="flex items-center gap-2 text-base font-bold text-slate-800">
              <CalendarDays className="h-5 w-5 text-teal-600" />
              مواعيد اليوم
            </h2>
            <button onClick={() => onNavigate('appointments')} className="flex items-center gap-1 text-sm font-semibold text-teal-600 hover:text-teal-700">
              عرض الكل <ArrowLeft className="h-4 w-4" />
            </button>
          </div>
          <div className="p-4">
            {todayAppointments.length === 0 ? (
              <EmptyState icon={<CalendarDays className="h-10 w-10" />} title="لا مواعيد اليوم" description="استمتع بيوم هادئ" />
            ) : (
              <div className="space-y-2">
                {todayAppointments.map((a) => (
                  <div
                    key={a.id}
                    className="flex items-center justify-between rounded-xl border border-slate-100 bg-slate-50/50 px-4 py-3 transition-colors hover:bg-slate-50"
                  >
                    <div className="flex items-center gap-3">
                      <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-teal-100 text-sm font-bold text-teal-700">
                        {formatTime(a.start_time).split(':')[0]}
                      </div>
                      <div>
                        <p className="font-semibold text-slate-800">{a.patient?.name ?? '—'}</p>
                        <p className="text-xs text-slate-500">
                          {a.service?.name ?? 'غير محدد'} · {formatTime(a.start_time)}
                        </p>
                      </div>
                    </div>
                    <span className={`badge ${appointmentStatusClass(a.status)}`}>
                      {APPOINTMENT_STATUS_LABELS[a.status]}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Recent activity */}
        <div className="card">
          <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
            <h2 className="flex items-center gap-2 text-base font-bold text-slate-800">
              <Activity className="h-5 w-5 text-teal-600" />
              أحدث المواعيد
            </h2>
          </div>
          <div className="p-4">
            {recentAppointments.length === 0 ? (
              <EmptyState icon={<Stethoscope className="h-10 w-10" />} title="لا يوجد نشاط بعد" />
            ) : (
              <div className="space-y-2">
                {recentAppointments.map((a) => (
                  <div key={a.id} className="rounded-xl px-3 py-2.5 hover:bg-slate-50">
                    <div className="flex items-center justify-between">
                      <p className="font-semibold text-slate-800">{a.patient?.name ?? '—'}</p>
                      <span className={`badge ${appointmentStatusClass(a.status)}`}>
                        {APPOINTMENT_STATUS_LABELS[a.status]}
                      </span>
                    </div>
                    <p className="mt-0.5 text-xs text-slate-500">{formatDateTime(a.start_time)}</p>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
