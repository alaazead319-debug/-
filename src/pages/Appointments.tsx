import { useEffect, useMemo, useState } from 'react';
import { Plus, Pencil, Trash2, CalendarDays, Clock, Check, X, CalendarX2 } from 'lucide-react';
import { supabase } from '../lib/supabase';
import type { Appointment, AppointmentStatus, AppointmentWithRelations, Patient, Service } from '../lib/types';
import { APPOINTMENT_STATUS_LABELS } from '../lib/types';
import { appointmentStatusClass, formatDateTime, toLocalInput } from '../lib/helpers';
import { useToast } from '../components/Toast';
import { Modal } from '../components/Modal';
import { ConfirmDialog, EmptyState, PageLoading, Spinner } from '../components/ui';

type FormState = {
  patient_id: string;
  service_id: string;
  start_time: string;
  duration_min: number;
  status: AppointmentStatus;
  notes: string;
};

const EMPTY_FORM: FormState = {
  patient_id: '',
  service_id: '',
  start_time: '',
  duration_min: 30,
  status: 'scheduled',
  notes: '',
};

const STATUS_FLOW: AppointmentStatus[] = ['scheduled', 'confirmed', 'completed', 'cancelled', 'no_show'];

export function Appointments() {
  const { push } = useToast();
  const [loading, setLoading] = useState(true);
  const [appointments, setAppointments] = useState<AppointmentWithRelations[]>([]);
  const [patients, setPatients] = useState<Patient[]>([]);
  const [services, setServices] = useState<Service[]>([]);
  const [filter, setFilter] = useState<'upcoming' | 'all' | 'past'>('upcoming');
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Appointment | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Appointment | null>(null);
  const [deleting, setDeleting] = useState(false);

  const load = async () => {
    setLoading(true);
    const [appts, pats, svcs] = await Promise.all([
      supabase
        .from('appointments')
        .select('*, patient:patients(id,name,phone), service:services(id,name,duration_min,price)')
        .order('start_time', { ascending: filter === 'past' ? false : true }),
      supabase.from('patients').select('id, name').order('name'),
      supabase.from('services').select('id, name, duration_min, price').order('name'),
    ]);
    setAppointments((appts.data as AppointmentWithRelations[]) ?? []);
    setPatients((pats.data as Patient[]) ?? []);
    setServices((svcs.data as Service[]) ?? []);
    setLoading(false);
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filter]);

  const filtered = useMemo(() => {
    const now = Date.now();
    if (filter === 'upcoming') return appointments.filter((a) => new Date(a.start_time).getTime() >= now);
    if (filter === 'past') return appointments.filter((a) => new Date(a.start_time).getTime() < now);
    return appointments;
  }, [appointments, filter]);

  const openAdd = () => {
    setEditing(null);
    const now = new Date();
    now.setMinutes(0, 0, 0);
    now.setHours(now.getHours() + 1);
    setForm({ ...EMPTY_FORM, start_time: toLocalInput(now) });
    setModalOpen(true);
  };

  const openEdit = (a: AppointmentWithRelations) => {
    setEditing(a);
    setForm({
      patient_id: a.patient_id,
      service_id: a.service_id ?? '',
      start_time: toLocalInput(new Date(a.start_time)),
      duration_min: a.service?.duration_min ?? 30,
      status: a.status,
      notes: a.notes ?? '',
    });
    setModalOpen(true);
  };

  const save = async () => {
    if (!form.patient_id) {
      push('الرجاء اختيار المريض', 'error');
      return;
    }
    if (!form.start_time) {
      push('الرجاء تحديد وقت الموعد', 'error');
      return;
    }
    setSaving(true);
    const start = new Date(form.start_time);
    const end = new Date(start.getTime() + form.duration_min * 60000);
    const payload = {
      patient_id: form.patient_id,
      service_id: form.service_id || null,
      start_time: start.toISOString(),
      end_time: end.toISOString(),
      status: form.status,
      notes: form.notes.trim() || null,
    };
    if (editing) {
      const { error } = await supabase.from('appointments').update(payload).eq('id', editing.id);
      if (error) {
        push('فشل تحديث الموعد', 'error');
      } else {
        push('تم تحديث الموعد بنجاح');
        setModalOpen(false);
        load();
      }
    } else {
      const { data, error } = await supabase.from('appointments').insert(payload).select('id').single();
      if (error) {
        push('فشل إنشاء الموعد', 'error');
      } else {
        push('تم إنشاء الموعد بنجاح');
        setModalOpen(false);
        load();
        // Fire webhook event for new appointment
        const patient = patients.find((p) => p.id === form.patient_id);
        const service = services.find((s) => s.id === form.service_id);
        const { data: settings } = await supabase.from('settings').select('*').eq('id', 1).maybeSingle();
        if (data && settings) {
          // dispatch webhook (fire and forget)
          import('../lib/webhook').then(({ dispatchWebhook }) =>
            dispatchWebhook(
              'appointment.created',
              {
                appointment_id: data.id,
                patient_id: form.patient_id,
                patient_name: patient?.name,
                patient_phone: patient?.phone,
                service_name: service?.name,
                start_time: payload.start_time,
                end_time: payload.end_time,
                status: payload.status,
              },
              settings as never,
            ),
          );
        }
      }
    }
    setSaving(false);
  };

  const updateStatus = async (a: AppointmentWithRelations, status: AppointmentStatus) => {
    const { error } = await supabase.from('appointments').update({ status }).eq('id', a.id);
    if (error) {
      push('فشل تحديث الحالة', 'error');
    } else {
      push('تم تحديث حالة الموعد');
      setAppointments((cur) => cur.map((x) => (x.id === a.id ? { ...x, status } : x)));
      if (status === 'completed') {
        const { data: settings } = await supabase.from('settings').select('*').eq('id', 1).maybeSingle();
        if (settings) {
          import('../lib/webhook').then(({ dispatchWebhook }) =>
            dispatchWebhook('appointment.completed', {
              appointment_id: a.id,
              patient_id: a.patient_id,
              patient_name: a.patient?.name,
              service_name: a.service?.name,
            }, settings as never),
          );
        }
      }
    }
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    const { error } = await supabase.from('appointments').delete().eq('id', deleteTarget.id);
    setDeleting(false);
    if (error) {
      push('فشل حذف الموعد', 'error');
    } else {
      push('تم حذف الموعد');
      setDeleteTarget(null);
      load();
    }
  };

  if (loading) return <PageLoading />;

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex gap-1 rounded-lg bg-slate-100 p-1">
          {(['upcoming', 'all', 'past'] as const).map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`rounded-md px-3 py-1.5 text-sm font-semibold transition-colors ${
                filter === f ? 'bg-white text-teal-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'
              }`}
            >
              {f === 'upcoming' ? 'القادمة' : f === 'past' ? 'السابقة' : 'الكل'}
            </button>
          ))}
        </div>
        <button onClick={openAdd} className="btn-primary">
          <Plus className="h-4 w-4" /> موعد جديد
        </button>
      </div>

      {filtered.length === 0 ? (
        <EmptyState
          icon={<CalendarDays className="h-12 w-12" />}
          title="لا توجد مواعيد"
          description={filter === 'upcoming' ? 'لا مواعيد قادمة — أضف موعدًا جديدًا' : undefined}
          action={
            <button onClick={openAdd} className="btn-primary">
              <Plus className="h-4 w-4" /> حجز موعد
            </button>
          }
        />
      ) : (
        <div className="space-y-3">
          {filtered.map((a) => (
            <div key={a.id} className="card p-4 transition-shadow hover:shadow-md">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex items-start gap-3">
                  <div className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-xl bg-teal-50 text-teal-600">
                    <Clock className="h-6 w-6" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <p className="font-bold text-slate-800">{a.patient?.name ?? '—'}</p>
                      <span className={`badge ${appointmentStatusClass(a.status)}`}>
                        {APPOINTMENT_STATUS_LABELS[a.status]}
                      </span>
                    </div>
                    <p className="mt-0.5 text-sm text-slate-500">
                      {a.service?.name ?? 'غير محدد'} · {formatDateTime(a.start_time)}
                    </p>
                    {a.notes && <p className="mt-1 text-xs text-slate-400">{a.notes}</p>}
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  {a.status !== 'completed' && (
                    <button
                      onClick={() => updateStatus(a, 'completed')}
                      className="inline-flex items-center gap-1 rounded-lg bg-emerald-50 px-2.5 py-1.5 text-xs font-semibold text-emerald-700 ring-1 ring-emerald-200 hover:bg-emerald-100"
                      title="تم الإكمال"
                    >
                      <Check className="h-3.5 w-3.5" /> إكمال
                    </button>
                  )}
                  {a.status === 'scheduled' && (
                    <button
                      onClick={() => updateStatus(a, 'confirmed')}
                      className="inline-flex items-center gap-1 rounded-lg bg-blue-50 px-2.5 py-1.5 text-xs font-semibold text-blue-700 ring-1 ring-blue-200 hover:bg-blue-100"
                      title="تأكيد"
                    >
                      <Check className="h-3.5 w-3.5" /> تأكيد
                    </button>
                  )}
                  {a.status !== 'cancelled' && a.status !== 'completed' && (
                    <button
                      onClick={() => updateStatus(a, 'cancelled')}
                      className="inline-flex items-center gap-1 rounded-lg bg-slate-50 px-2.5 py-1.5 text-xs font-semibold text-slate-600 ring-1 ring-slate-200 hover:bg-slate-100"
                      title="إلغاء"
                    >
                      <X className="h-3.5 w-3.5" /> إلغاء
                    </button>
                  )}
                  <button
                    onClick={() => updateStatus(a, 'no_show')}
                    className="inline-flex items-center gap-1 rounded-lg bg-amber-50 px-2.5 py-1.5 text-xs font-semibold text-amber-700 ring-1 ring-amber-200 hover:bg-amber-100"
                    title="لم يحضر"
                  >
                    <CalendarX2 className="h-3.5 w-3.5" />
                  </button>
                  <div className="mx-1 h-5 w-px bg-slate-200" />
                  <button onClick={() => openEdit(a)} className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-teal-600">
                    <Pencil className="h-4 w-4" />
                  </button>
                  <button onClick={() => setDeleteTarget(a)} className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-rose-600">
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title={editing ? 'تعديل الموعد' : 'حجز موعد جديد'} size="md">
        <div className="space-y-4">
          <div>
            <label className="label">المريض *</label>
            <select value={form.patient_id} onChange={(e) => setForm({ ...form, patient_id: e.target.value })} className="input">
              <option value="">— اختر المريض —</option>
              {patients.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="label">الخدمة</label>
            <select
              value={form.service_id}
              onChange={(e) => {
                const svc = services.find((s) => s.id === e.target.value);
                setForm({ ...form, service_id: e.target.value, duration_min: svc?.duration_min ?? form.duration_min });
              }}
              className="input"
            >
              <option value="">— اختر الخدمة —</option>
              {services.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name} ({s.duration_min} د)
                </option>
              ))}
            </select>
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label className="label">تاريخ ووقت البدء *</label>
              <input type="datetime-local" value={form.start_time} onChange={(e) => setForm({ ...form, start_time: e.target.value })} className="input" />
            </div>
            <div>
              <label className="label">المدة (بالدقائق)</label>
              <input
                type="number"
                min={5}
                step={5}
                value={form.duration_min}
                onChange={(e) => setForm({ ...form, duration_min: Number(e.target.value) || 30 })}
                className="input"
              />
            </div>
          </div>
          <div>
            <label className="label">الحالة</label>
            <select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value as AppointmentStatus })} className="input">
              {STATUS_FLOW.map((s) => (
                <option key={s} value={s}>
                  {APPOINTMENT_STATUS_LABELS[s]}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="label">ملاحظات</label>
            <textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} className="input min-h-[70px] resize-y" placeholder="ملاحظات حول الموعد..." />
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <button onClick={() => setModalOpen(false)} className="btn-secondary">إلغاء</button>
            <button onClick={save} disabled={saving} className="btn-primary">
              {saving ? <Spinner className="h-4 w-4" /> : null}
              {editing ? 'حفظ التعديلات' : 'حجز الموعد'}
            </button>
          </div>
        </div>
      </Modal>

      <ConfirmDialog
        open={!!deleteTarget}
        title="حذف الموعد"
        message="سيتم حذف هذا الموعد نهائيًا."
        onConfirm={confirmDelete}
        onCancel={() => setDeleteTarget(null)}
        loading={deleting}
      />
    </div>
  );
}
