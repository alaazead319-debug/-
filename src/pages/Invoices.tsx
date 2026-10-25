import { useEffect, useMemo, useState } from 'react';
import { Plus, Pencil, Trash2, Receipt, Search, Printer, CheckCircle2 } from 'lucide-react';
import { supabase } from '../lib/supabase';
import type { Invoice, InvoiceItem, InvoiceStatus, InvoiceWithRelations, Patient, Service } from '../lib/types';
import { INVOICE_STATUS_LABELS } from '../lib/types';
import { formatPrice, formatDate, invoiceStatusClass } from '../lib/helpers';
import { useToast } from '../components/Toast';
import { Modal } from '../components/Modal';
import { ConfirmDialog, EmptyState, PageLoading, Spinner } from '../components/ui';

type FormItem = { service_id: string; description: string; qty: number; unit_price: number };
type FormState = {
  patient_id: string;
  appointment_id: string;
  items: FormItem[];
  paid: number;
  due_at: string;
  notes: string;
};

export function Invoices() {
  const { push } = useToast();
  const [loading, setLoading] = useState(true);
  const [invoices, setInvoices] = useState<InvoiceWithRelations[]>([]);
  const [patients, setPatients] = useState<Patient[]>([]);
  const [services, setServices] = useState<Service[]>([]);
  const [query, setQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | InvoiceStatus>('all');
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Invoice | null>(null);
  const [form, setForm] = useState<FormState>({
    patient_id: '',
    appointment_id: '',
    items: [{ service_id: '', description: '', qty: 1, unit_price: 0 }],
    paid: 0,
    due_at: '',
    notes: '',
  });
  const [saving, setSaving] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Invoice | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [viewTarget, setViewTarget] = useState<InvoiceWithRelations | null>(null);

  const load = async () => {
    setLoading(true);
    const [inv, pats, svcs] = await Promise.all([
      supabase
        .from('invoices')
        .select('*, patient:patients(id,name,phone), appointment:appointments(id,start_time), invoice_items(*)')
        .order('issued_at', { ascending: false }),
      supabase.from('patients').select('id, name').order('name'),
      supabase.from('services').select('id, name, price').order('name'),
    ]);
    setInvoices((inv.data as InvoiceWithRelations[]) ?? []);
    setPatients((pats.data as Patient[]) ?? []);
    setServices((svcs.data as Service[]) ?? []);
    setLoading(false);
  };

  useEffect(() => {
    load();
  }, []);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return invoices.filter((inv) => {
      const matchesQ = !q || inv.patient?.name?.toLowerCase().includes(q);
      const matchesS = statusFilter === 'all' || inv.status === statusFilter;
      return matchesQ && matchesS;
    });
  }, [invoices, query, statusFilter]);

  const itemsTotal = form.items.reduce((sum, it) => sum + it.qty * it.unit_price, 0);

  const openAdd = () => {
    setEditing(null);
    setForm({
      patient_id: '',
      appointment_id: '',
      items: [{ service_id: '', description: '', qty: 1, unit_price: 0 }],
      paid: 0,
      due_at: '',
      notes: '',
    });
    setModalOpen(true);
  };

  const openEdit = (inv: InvoiceWithRelations) => {
    setEditing(inv);
    setForm({
      patient_id: inv.patient_id,
      appointment_id: inv.appointment_id ?? '',
      items:
        inv.invoice_items.length > 0
          ? inv.invoice_items.map((it) => ({
              service_id: it.service_id ?? '',
              description: it.description,
              qty: it.qty,
              unit_price: Number(it.unit_price),
            }))
          : [{ service_id: '', description: '', qty: 1, unit_price: 0 }],
      paid: Number(inv.paid),
      due_at: inv.due_at ? inv.due_at.slice(0, 10) : '',
      notes: inv.notes ?? '',
    });
    setModalOpen(true);
  };

  const updateItem = (idx: number, patch: Partial<FormItem>) => {
    setForm((f) => {
      const items = [...f.items];
      items[idx] = { ...items[idx], ...patch };
      return { ...f, items };
    });
  };

  const addItem = () => setForm((f) => ({ ...f, items: [...f.items, { service_id: '', description: '', qty: 1, unit_price: 0 }] }));
  const removeItem = (idx: number) => setForm((f) => ({ ...f, items: f.items.filter((_, i) => i !== idx) }));

  const onServiceSelect = (idx: number, serviceId: string) => {
    const svc = services.find((s) => s.id === serviceId);
    updateItem(idx, { service_id: serviceId, description: svc?.name ?? '', unit_price: svc ? Number(svc.price) : 0 });
  };

  const computeStatus = (total: number, paid: number): InvoiceStatus => {
    if (paid <= 0) return 'unpaid';
    if (paid >= total) return 'paid';
    return 'partial';
  };

  const save = async () => {
    if (!form.patient_id) {
      push('الرجاء اختيار المريض', 'error');
      return;
    }
    const validItems = form.items.filter((it) => it.description.trim() && it.qty > 0);
    if (validItems.length === 0) {
      push('أضف بندًا واحدًا على الأقل', 'error');
      return;
    }
    setSaving(true);
    const total = validItems.reduce((s, it) => s + it.qty * it.unit_price, 0);
    const status = computeStatus(total, form.paid);
    const invoicePayload = {
      patient_id: form.patient_id,
      appointment_id: form.appointment_id || null,
      total,
      paid: form.paid,
      status,
      due_at: form.due_at ? new Date(form.due_at).toISOString() : null,
      notes: form.notes.trim() || null,
    };

    if (editing) {
      const { error } = await supabase.from('invoices').update(invoicePayload).eq('id', editing.id);
      if (error) {
        push('فشل تحديث الفاتورة', 'error');
        setSaving(false);
        return;
      }
      // Replace items
      await supabase.from('invoice_items').delete().eq('invoice_id', editing.id);
      const itemRows = validItems.map((it) => ({
        invoice_id: editing.id,
        service_id: it.service_id || null,
        description: it.description.trim(),
        qty: it.qty,
        unit_price: it.unit_price,
        total: it.qty * it.unit_price,
      }));
      await supabase.from('invoice_items').insert(itemRows);
      push('تم تحديث الفاتورة');
      setModalOpen(false);
      load();
    } else {
      const { data, error } = await supabase.from('invoices').insert(invoicePayload).select('id').single();
      if (error || !data) {
        push('فشل إنشاء الفاتورة', 'error');
        setSaving(false);
        return;
      }
      const invoiceId = data.id as string;
      const itemRows = validItems.map((it) => ({
        invoice_id: invoiceId,
        service_id: it.service_id || null,
        description: it.description.trim(),
        qty: it.qty,
        unit_price: it.unit_price,
        total: it.qty * it.unit_price,
      }));
      await supabase.from('invoice_items').insert(itemRows);
      push('تم إنشاء الفاتورة');
      setModalOpen(false);
      load();
      // Fire webhook
      const patient = patients.find((p) => p.id === form.patient_id);
      const { data: settings } = await supabase.from('settings').select('*').eq('id', 1).maybeSingle();
      if (settings) {
        import('../lib/webhook').then(({ dispatchWebhook }) =>
          dispatchWebhook(
            'invoice.created',
            {
              invoice_id: invoiceId,
              patient_id: form.patient_id,
              patient_name: patient?.name,
              total,
              paid: form.paid,
              status,
            },
            settings as never,
          ),
        );
      }
    }
    setSaving(false);
  };

  const markPaid = async (inv: InvoiceWithRelations) => {
    const { error } = await supabase
      .from('invoices')
      .update({ paid: Number(inv.total), status: 'paid' as InvoiceStatus })
      .eq('id', inv.id);
    if (error) push('فشل تحديث الفاتورة', 'error');
    else {
      push('تم تحديد الفاتورة كمدفوعة');
      setInvoices((cur) =>
        cur.map((x) => (x.id === inv.id ? { ...x, paid: Number(x.total), status: 'paid' as InvoiceStatus } : x)),
      );
      const { data: settings } = await supabase.from('settings').select('*').eq('id', 1).maybeSingle();
      if (settings) {
        import('../lib/webhook').then(({ dispatchWebhook }) =>
          dispatchWebhook('invoice.paid', { invoice_id: inv.id, patient_id: inv.patient_id, patient_name: inv.patient?.name, total: Number(inv.total) }, settings as never),
        );
      }
    }
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    const { error } = await supabase.from('invoices').delete().eq('id', deleteTarget.id);
    setDeleting(false);
    if (error) push('فشل حذف الفاتورة', 'error');
    else {
      push('تم حذف الفاتورة');
      setDeleteTarget(null);
      load();
    }
  };

  if (loading) return <PageLoading />;

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-1 flex-col gap-2 sm:flex-row sm:items-center">
          <div className="relative flex-1 sm:max-w-xs">
            <Search className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="ابحث باسم المريض..." className="input pr-9" />
          </div>
          <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value as 'all' | InvoiceStatus)} className="input sm:max-w-[180px]">
            <option value="all">كل الحالات</option>
            {Object.entries(INVOICE_STATUS_LABELS).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </select>
        </div>
        <button onClick={openAdd} className="btn-primary">
          <Plus className="h-4 w-4" /> فاتورة جديدة
        </button>
      </div>

      {filtered.length === 0 ? (
        <EmptyState
          icon={<Receipt className="h-12 w-12" />}
          title="لا توجد فواتير"
          description="أنشئ فاتورة جديدة لمريض"
          action={
            <button onClick={openAdd} className="btn-primary">
              <Plus className="h-4 w-4" /> إنشاء فاتورة
            </button>
          }
        />
      ) : (
        <div className="card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-right text-sm">
              <thead className="border-b border-slate-100 bg-slate-50 text-xs font-semibold text-slate-500">
                <tr>
                  <th className="px-4 py-3">المريض</th>
                  <th className="px-4 py-3">الإجمالي</th>
                  <th className="px-4 py-3">المدفوع</th>
                  <th className="px-4 py-3">الحالة</th>
                  <th className="px-4 py-3">تاريخ الإصدار</th>
                  <th className="px-4 py-3">إجراءات</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {filtered.map((inv) => (
                  <tr key={inv.id} className="hover:bg-slate-50/60">
                    <td className="px-4 py-3 font-semibold text-slate-800">{inv.patient?.name ?? '—'}</td>
                    <td className="px-4 py-3 font-bold text-slate-700">{formatPrice(Number(inv.total))}</td>
                    <td className="px-4 py-3 text-slate-600">{formatPrice(Number(inv.paid))}</td>
                    <td className="px-4 py-3">
                      <span className={`badge ${invoiceStatusClass(inv.status)}`}>
                        {INVOICE_STATUS_LABELS[inv.status]}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-slate-500">{formatDate(inv.issued_at)}</td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1">
                        {inv.status !== 'paid' && inv.status !== 'void' && (
                          <button
                            onClick={() => markPaid(inv)}
                            className="rounded-lg p-1.5 text-emerald-600 hover:bg-emerald-50"
                            title="تحديد كمدفوعة"
                          >
                            <CheckCircle2 className="h-4 w-4" />
                          </button>
                        )}
                        <button onClick={() => setViewTarget(inv)} className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700" title="عرض">
                          <Printer className="h-4 w-4" />
                        </button>
                        <button onClick={() => openEdit(inv)} className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-teal-600">
                          <Pencil className="h-4 w-4" />
                        </button>
                        <button onClick={() => setDeleteTarget(inv)} className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-rose-600">
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Create/Edit modal */}
      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title={editing ? 'تعديل الفاتورة' : 'فاتورة جديدة'} size="lg">
        <div className="space-y-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
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
              <label className="label">تاريخ الاستحقاق</label>
              <input type="date" value={form.due_at} onChange={(e) => setForm({ ...form, due_at: e.target.value })} className="input" />
            </div>
          </div>

          <div>
            <div className="mb-2 flex items-center justify-between">
              <label className="label mb-0">بنود الفاتورة</label>
              <button onClick={addItem} className="text-sm font-semibold text-teal-600 hover:text-teal-700">
                + إضافة بند
              </button>
            </div>
            <div className="space-y-2">
              {form.items.map((it, idx) => (
                <div key={idx} className="grid grid-cols-12 gap-2 rounded-xl bg-slate-50 p-2.5">
                  <select
                    value={it.service_id}
                    onChange={(e) => onServiceSelect(idx, e.target.value)}
                    className="input col-span-12 py-1.5 sm:col-span-4"
                  >
                    <option value="">— خدمة (اختياري) —</option>
                    {services.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name} — {formatPrice(Number(s.price))}
                      </option>
                    ))}
                  </select>
                  <input
                    value={it.description}
                    onChange={(e) => updateItem(idx, { description: e.target.value })}
                    placeholder="الوصف"
                    className="input col-span-12 py-1.5 sm:col-span-4"
                  />
                  <input
                    type="number"
                    min={1}
                    value={it.qty}
                    onChange={(e) => updateItem(idx, { qty: Number(e.target.value) || 1 })}
                    className="input col-span-4 py-1.5 sm:col-span-1"
                    title="الكمية"
                  />
                  <input
                    type="number"
                    min={0}
                    value={it.unit_price}
                    onChange={(e) => updateItem(idx, { unit_price: Number(e.target.value) || 0 })}
                    className="input col-span-8 py-1.5 sm:col-span-2"
                    title="سعر الوحدة"
                  />
                  <div className="col-span-10 flex items-center justify-end text-sm font-bold text-slate-700 sm:col-span-1">
                    {formatPrice(it.qty * it.unit_price)}
                  </div>
                  <button
                    onClick={() => removeItem(idx)}
                    disabled={form.items.length === 1}
                    className="col-span-2 flex items-center justify-center rounded-lg text-slate-400 hover:bg-rose-50 hover:text-rose-600 disabled:opacity-40 sm:col-span-1"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <div>
              <label className="label">المبلغ المدفوع (ر.س)</label>
              <input type="number" min={0} value={form.paid} onChange={(e) => setForm({ ...form, paid: Number(e.target.value) || 0 })} className="input" />
            </div>
            <div className="sm:col-span-2 sm:flex sm:items-end">
              <div className="w-full rounded-xl bg-teal-50 px-4 py-3">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-slate-600">الإجمالي</span>
                  <span className="font-bold text-teal-700">{formatPrice(itemsTotal)}</span>
                </div>
                <div className="mt-1 flex items-center justify-between text-sm">
                  <span className="text-slate-600">المتبقي</span>
                  <span className="font-bold text-rose-600">{formatPrice(Math.max(itemsTotal - form.paid, 0))}</span>
                </div>
              </div>
            </div>
          </div>

          <div>
            <label className="label">ملاحظات</label>
            <textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} className="input min-h-[60px] resize-y" />
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <button onClick={() => setModalOpen(false)} className="btn-secondary">إلغاء</button>
            <button onClick={save} disabled={saving} className="btn-primary">
              {saving ? <Spinner className="h-4 w-4" /> : null}
              {editing ? 'حفظ التعديلات' : 'إنشاء الفاتورة'}
            </button>
          </div>
        </div>
      </Modal>

      {/* Invoice view */}
      <Modal open={!!viewTarget} onClose={() => setViewTarget(null)} title="عرض الفاتورة" size="md">
        {viewTarget && (
          <div className="space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div>
                <p className="text-lg font-extrabold text-slate-800">{viewTarget.patient?.name ?? '—'}</p>
                <p className="text-xs text-slate-500">تاريخ الإصدار: {formatDate(viewTarget.issued_at)}</p>
              </div>
              <span className={`badge ${invoiceStatusClass(viewTarget.status)}`}>
                {INVOICE_STATUS_LABELS[viewTarget.status]}
              </span>
            </div>
            <div className="overflow-hidden rounded-xl border border-slate-100">
              <table className="w-full text-right text-sm">
                <thead className="bg-slate-50 text-xs font-semibold text-slate-500">
                  <tr>
                    <th className="px-3 py-2">الوصف</th>
                    <th className="px-3 py-2">الكمية</th>
                    <th className="px-3 py-2">السعر</th>
                    <th className="px-3 py-2">الإجمالي</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {viewTarget.invoice_items.map((it: InvoiceItem) => (
                    <tr key={it.id}>
                      <td className="px-3 py-2 font-semibold text-slate-700">{it.description}</td>
                      <td className="px-3 py-2 text-slate-500">{it.qty}</td>
                      <td className="px-3 py-2 text-slate-500">{formatPrice(Number(it.unit_price))}</td>
                      <td className="px-3 py-2 font-bold text-slate-700">{formatPrice(Number(it.total))}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="space-y-1 text-sm">
              <div className="flex justify-between"><span className="text-slate-500">الإجمالي</span><span className="font-bold text-slate-800">{formatPrice(Number(viewTarget.total))}</span></div>
              <div className="flex justify-between"><span className="text-slate-500">المدفوع</span><span className="font-bold text-emerald-600">{formatPrice(Number(viewTarget.paid))}</span></div>
              <div className="flex justify-between"><span className="text-slate-500">المتبقي</span><span className="font-bold text-rose-600">{formatPrice(Number(viewTarget.total) - Number(viewTarget.paid))}</span></div>
            </div>
          </div>
        )}
      </Modal>

      <ConfirmDialog
        open={!!deleteTarget}
        title="حذف الفاتورة"
        message="سيتم حذف الفاتورة وبنودها نهائيًا."
        onConfirm={confirmDelete}
        onCancel={() => setDeleteTarget(null)}
        loading={deleting}
      />
    </div>
  );
}
