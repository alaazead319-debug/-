import { useEffect, useMemo, useState } from 'react';
import { Plus, Search, Pencil, Trash2, Phone, Users, Mail, MapPin } from 'lucide-react';
import { supabase } from '../lib/supabase';
import type { Patient } from '../lib/types';
import { calcAge, formatDate } from '../lib/helpers';
import { useToast } from '../components/Toast';
import { Modal } from '../components/Modal';
import { ConfirmDialog, EmptyState, PageLoading, Spinner } from '../components/ui';

type FormState = {
  name: string;
  phone: string;
  email: string;
  gender: 'male' | 'female';
  birth_date: string;
  address: string;
  notes: string;
};

const EMPTY: FormState = {
  name: '',
  phone: '',
  email: '',
  gender: 'male',
  birth_date: '',
  address: '',
  notes: '',
};

export function Patients() {
  const { push } = useToast();
  const [loading, setLoading] = useState(true);
  const [patients, setPatients] = useState<Patient[]>([]);
  const [query, setQuery] = useState('');
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Patient | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY);
  const [saving, setSaving] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Patient | null>(null);
  const [deleting, setDeleting] = useState(false);

  const load = async () => {
    setLoading(true);
    const { data } = await supabase
      .from('patients')
      .select('*')
      .order('created_at', { ascending: false });
    setPatients((data as Patient[]) ?? []);
    setLoading(false);
  };

  useEffect(() => {
    load();
  }, []);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return patients;
    return patients.filter(
      (p) =>
        p.name.toLowerCase().includes(q) ||
        (p.phone ?? '').includes(q) ||
        (p.email ?? '').toLowerCase().includes(q),
    );
  }, [patients, query]);

  const openAdd = () => {
    setEditing(null);
    setForm(EMPTY);
    setModalOpen(true);
  };

  const openEdit = (p: Patient) => {
    setEditing(p);
    setForm({
      name: p.name,
      phone: p.phone ?? '',
      email: p.email ?? '',
      gender: p.gender,
      birth_date: p.birth_date ?? '',
      address: p.address ?? '',
      notes: p.notes ?? '',
    });
    setModalOpen(true);
  };

  const save = async () => {
    if (!form.name.trim()) {
      push('الرجاء إدخال اسم المريض', 'error');
      return;
    }
    setSaving(true);
    const payload = {
      name: form.name.trim(),
      phone: form.phone.trim() || null,
      email: form.email.trim() || null,
      gender: form.gender,
      birth_date: form.birth_date || null,
      address: form.address.trim() || null,
      notes: form.notes.trim() || null,
    };
    if (editing) {
      const { error } = await supabase.from('patients').update(payload).eq('id', editing.id);
      if (error) {
        push('فشل تحديث بيانات المريض', 'error');
      } else {
        push('تم تحديث بيانات المريض بنجاح');
        setModalOpen(false);
        load();
      }
    } else {
      const { error } = await supabase.from('patients').insert(payload);
      if (error) {
        push('فشل إضافة المريض', 'error');
      } else {
        push('تمت إضافة المريض بنجاح');
        setModalOpen(false);
        load();
      }
    }
    setSaving(false);
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    const { error } = await supabase.from('patients').delete().eq('id', deleteTarget.id);
    setDeleting(false);
    if (error) {
      push('فشل حذف المريض', 'error');
    } else {
      push('تم حذف المريض بنجاح');
      setDeleteTarget(null);
      load();
    }
  };

  if (loading) return <PageLoading />;

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative flex-1 sm:max-w-xs">
          <Search className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="ابحث بالاسم أو الهاتف..."
            className="input pr-9"
          />
        </div>
        <button onClick={openAdd} className="btn-primary">
          <Plus className="h-4 w-4" /> مريض جديد
        </button>
      </div>

      {filtered.length === 0 ? (
        <EmptyState
          icon={<Users className="h-12 w-12" />}
          title="لا يوجد مرضى"
          description="ابدأ بإضافة أول مريض للعيادة"
          action={
            <button onClick={openAdd} className="btn-primary">
              <Plus className="h-4 w-4" /> إضافة مريض
            </button>
          }
        />
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {filtered.map((p) => {
            const age = calcAge(p.birth_date);
            return (
              <div key={p.id} className="card p-5 transition-shadow hover:shadow-md">
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-3">
                    <div
                      className={`flex h-12 w-12 items-center justify-center rounded-full text-base font-bold text-white ${
                        p.gender === 'male' ? 'bg-blue-500' : 'bg-pink-500'
                      }`}
                    >
                      {p.name.charAt(0)}
                    </div>
                    <div>
                      <p className="font-bold text-slate-800">{p.name}</p>
                      <p className="text-xs text-slate-500">
                        {p.gender === 'male' ? 'ذكر' : 'أنثى'}
                        {age !== null ? ` · ${age} سنة` : ''}
                      </p>
                    </div>
                  </div>
                  <div className="flex gap-1">
                    <button onClick={() => openEdit(p)} className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-teal-600">
                      <Pencil className="h-4 w-4" />
                    </button>
                    <button onClick={() => setDeleteTarget(p)} className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-rose-600">
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </div>
                <div className="mt-4 space-y-1.5 text-sm text-slate-600">
                  {p.phone && (
                    <p className="flex items-center gap-2">
                      <Phone className="h-3.5 w-3.5 text-slate-400" /> {p.phone}
                    </p>
                  )}
                  {p.email && (
                    <p className="flex items-center gap-2 truncate">
                      <Mail className="h-3.5 w-3.5 text-slate-400" /> {p.email}
                    </p>
                  )}
                  {p.address && (
                    <p className="flex items-center gap-2">
                      <MapPin className="h-3.5 w-3.5 text-slate-400" /> {p.address}
                    </p>
                  )}
                  <p className="text-xs text-slate-400">مسجل منذ {formatDate(p.created_at)}</p>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title={editing ? 'تعديل بيانات المريض' : 'إضافة مريض جديد'} size="md">
        <div className="space-y-4">
          <div>
            <label className="label">الاسم الكامل *</label>
            <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="input" placeholder="اسم المريض" />
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label className="label">رقم الهاتف</label>
              <input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} className="input" placeholder="05xxxxxxxx" />
            </div>
            <div>
              <label className="label">البريد الإلكتروني</label>
              <input value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} className="input" placeholder="email@example.com" />
            </div>
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label className="label">الجنس</label>
              <select value={form.gender} onChange={(e) => setForm({ ...form, gender: e.target.value as 'male' | 'female' })} className="input">
                <option value="male">ذكر</option>
                <option value="female">أنثى</option>
              </select>
            </div>
            <div>
              <label className="label">تاريخ الميلاد</label>
              <input type="date" value={form.birth_date} onChange={(e) => setForm({ ...form, birth_date: e.target.value })} className="input" />
            </div>
          </div>
          <div>
            <label className="label">العنوان</label>
            <input value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} className="input" placeholder="المدينة، الحي، الشارع" />
          </div>
          <div>
            <label className="label">ملاحظات</label>
            <textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} className="input min-h-[80px] resize-y" placeholder="حساسية، أمراض مزمنة، ملاحظات أخرى..." />
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <button onClick={() => setModalOpen(false)} className="btn-secondary">إلغاء</button>
            <button onClick={save} disabled={saving} className="btn-primary">
              {saving ? <Spinner className="h-4 w-4" /> : null}
              {editing ? 'حفظ التعديلات' : 'إضافة المريض'}
            </button>
          </div>
        </div>
      </Modal>

      <ConfirmDialog
        open={!!deleteTarget}
        title="حذف المريض"
        message={`سيتم حذف "${deleteTarget?.name}" وجميع مواعيده وفواتيره. لا يمكن التراجع عن هذا الإجراء.`}
        onConfirm={confirmDelete}
        onCancel={() => setDeleteTarget(null)}
        loading={deleting}
      />
    </div>
  );
}
