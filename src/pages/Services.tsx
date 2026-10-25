import { useEffect, useMemo, useState } from 'react';
import { Plus, Pencil, Trash2, Stethoscope, Search } from 'lucide-react';
import { supabase } from '../lib/supabase';
import type { Service } from '../lib/types';
import { SERVICE_CATEGORIES } from '../lib/types';
import { formatPrice, formatNumber } from '../lib/helpers';
import { useToast } from '../components/Toast';
import { Modal } from '../components/Modal';
import { ConfirmDialog, EmptyState, PageLoading, Spinner } from '../components/ui';

type FormState = {
  name: string;
  description: string;
  duration_min: number;
  price: number;
  category: string;
};

const EMPTY: FormState = {
  name: '',
  description: '',
  duration_min: 30,
  price: 0,
  category: 'general',
};

export function Services() {
  const { push } = useToast();
  const [loading, setLoading] = useState(true);
  const [services, setServices] = useState<Service[]>([]);
  const [query, setQuery] = useState('');
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Service | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY);
  const [saving, setSaving] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Service | null>(null);
  const [deleting, setDeleting] = useState(false);

  const load = async () => {
    setLoading(true);
    const { data } = await supabase.from('services').select('*').order('name', { ascending: true });
    setServices((data as Service[]) ?? []);
    setLoading(false);
  };

  useEffect(() => {
    load();
  }, []);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return services;
    return services.filter((s) => s.name.toLowerCase().includes(q) || (s.description ?? '').toLowerCase().includes(q));
  }, [services, query]);

  const openAdd = () => {
    setEditing(null);
    setForm(EMPTY);
    setModalOpen(true);
  };

  const openEdit = (s: Service) => {
    setEditing(s);
    setForm({
      name: s.name,
      description: s.description ?? '',
      duration_min: s.duration_min,
      price: Number(s.price),
      category: s.category,
    });
    setModalOpen(true);
  };

  const save = async () => {
    if (!form.name.trim()) {
      push('الرجاء إدخال اسم الخدمة', 'error');
      return;
    }
    setSaving(true);
    const payload = {
      name: form.name.trim(),
      description: form.description.trim() || null,
      duration_min: form.duration_min,
      price: form.price,
      category: form.category,
    };
    if (editing) {
      const { error } = await supabase.from('services').update(payload).eq('id', editing.id);
      if (error) push('فشل تحديث الخدمة', 'error');
      else {
        push('تم تحديث الخدمة');
        setModalOpen(false);
        load();
      }
    } else {
      const { error } = await supabase.from('services').insert(payload);
      if (error) push('فشل إضافة الخدمة', 'error');
      else {
        push('تمت إضافة الخدمة');
        setModalOpen(false);
        load();
      }
    }
    setSaving(false);
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    const { error } = await supabase.from('services').delete().eq('id', deleteTarget.id);
    setDeleting(false);
    if (error) push('فشل حذف الخدمة', 'error');
    else {
      push('تم حذف الخدمة');
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
          <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="ابحث عن خدمة..." className="input pr-9" />
        </div>
        <button onClick={openAdd} className="btn-primary">
          <Plus className="h-4 w-4" /> خدمة جديدة
        </button>
      </div>

      {filtered.length === 0 ? (
        <EmptyState
          icon={<Stethoscope className="h-12 w-12" />}
          title="لا توجد خدمات"
          description="أضف خدمات العيادة وأسعارها هنا"
          action={
            <button onClick={openAdd} className="btn-primary">
              <Plus className="h-4 w-4" /> إضافة خدمة
            </button>
          }
        />
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {filtered.map((s) => (
            <div key={s.id} className="card p-5 transition-shadow hover:shadow-md">
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-3">
                  <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-teal-50 text-teal-600">
                    <Stethoscope className="h-5 w-5" />
                  </div>
                  <div>
                    <p className="font-bold text-slate-800">{s.name}</p>
                    <p className="text-xs text-slate-500">{SERVICE_CATEGORIES[s.category] ?? s.category}</p>
                  </div>
                </div>
                <div className="flex gap-1">
                  <button onClick={() => openEdit(s)} className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-teal-600">
                    <Pencil className="h-4 w-4" />
                  </button>
                  <button onClick={() => setDeleteTarget(s)} className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-rose-600">
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </div>
              {s.description && <p className="mt-3 text-sm text-slate-500 line-clamp-2">{s.description}</p>}
              <div className="mt-4 flex items-center justify-between border-t border-slate-100 pt-3">
                <span className="inline-flex items-center gap-1.5 text-sm font-semibold text-slate-600">
                  <span className="text-slate-400">⏱</span> {formatNumber(s.duration_min)} دقيقة
                </span>
                <span className="text-lg font-extrabold text-teal-600">{formatPrice(Number(s.price))}</span>
              </div>
            </div>
          ))}
        </div>
      )}

      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title={editing ? 'تعديل الخدمة' : 'إضافة خدمة جديدة'} size="md">
        <div className="space-y-4">
          <div>
            <label className="label">اسم الخدمة *</label>
            <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="input" placeholder="مثال: حشو تجويف" />
          </div>
          <div>
            <label className="label">الوصف</label>
            <textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} className="input min-h-[70px] resize-y" placeholder="وصف مختصر للخدمة..." />
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <div>
              <label className="label">المدة (دقيقة)</label>
              <input type="number" min={5} step={5} value={form.duration_min} onChange={(e) => setForm({ ...form, duration_min: Number(e.target.value) || 30 })} className="input" />
            </div>
            <div>
              <label className="label">السعر (ر.س)</label>
              <input type="number" min={0} step={10} value={form.price} onChange={(e) => setForm({ ...form, price: Number(e.target.value) || 0 })} className="input" />
            </div>
            <div>
              <label className="label">التصنيف</label>
              <select value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} className="input">
                {Object.entries(SERVICE_CATEGORIES).map(([k, v]) => (
                  <option key={k} value={k}>
                    {v}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <button onClick={() => setModalOpen(false)} className="btn-secondary">إلغاء</button>
            <button onClick={save} disabled={saving} className="btn-primary">
              {saving ? <Spinner className="h-4 w-4" /> : null}
              {editing ? 'حفظ التعديلات' : 'إضافة الخدمة'}
            </button>
          </div>
        </div>
      </Modal>

      <ConfirmDialog
        open={!!deleteTarget}
        title="حذف الخدمة"
        message={`سيتم حذف "${deleteTarget?.name}". لن يؤثر ذلك على المواعيد السابقة.`}
        onConfirm={confirmDelete}
        onCancel={() => setDeleteTarget(null)}
        loading={deleting}
      />
    </div>
  );
}
