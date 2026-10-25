import { useEffect, useState } from 'react';
import { Save, Webhook, Activity, Send, CheckCircle2, XCircle, Clock } from 'lucide-react';
import { supabase } from '../lib/supabase';
import type { Settings, WebhookEvent } from '../lib/types';
import { formatDateTime } from '../lib/helpers';
import { useToast } from '../components/Toast';
import { Spinner, EmptyState } from '../components/ui';

export function SettingsPage({
  settings,
  setSettings,
}: {
  settings: Settings | null;
  setSettings: (s: Settings | null) => void;
}) {
  const { push } = useToast();
  const [form, setForm] = useState<Settings | null>(settings);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<string | null>(null);
  const [events, setEvents] = useState<WebhookEvent[]>([]);
  const [loadingEvents, setLoadingEvents] = useState(true);
  const [tab, setTab] = useState<'clinic' | 'webhook' | 'log'>('clinic');

  useEffect(() => {
    setForm(settings);
  }, [settings]);

  useEffect(() => {
    loadEvents();
  }, []);

  const loadEvents = async () => {
    setLoadingEvents(true);
    const { data } = await supabase
      .from('webhook_events')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(20);
    setEvents((data as WebhookEvent[]) ?? []);
    setLoadingEvents(false);
  };

  const save = async () => {
    if (!form) return;
    setSaving(true);
    const { data, error } = await supabase
      .from('settings')
      .update({
        clinic_name: form.clinic_name,
        phone: form.phone,
        email: form.email,
        address: form.address,
        n8n_webhook_url: form.n8n_webhook_url,
        n8n_enabled: form.n8n_enabled,
      })
      .eq('id', 1)
      .select('*')
      .single();
    setSaving(false);
    if (error || !data) {
      push('فشل حفظ الإعدادات', 'error');
    } else {
      setSettings(data as Settings);
      push('تم حفظ الإعدادات بنجاح');
    }
  };

  const sendTest = async () => {
    if (!form?.n8n_webhook_url) {
      push('أدخل عنوان webhook أولاً', 'error');
      return;
    }
    if (!form.n8n_enabled) {
      push('فعّل الـ webhook أولاً', 'error');
      return;
    }
    setTesting(true);
    setTestResult(null);
    // Persist settings before test
    const { data: saved } = await supabase
      .from('settings')
      .update({
        clinic_name: form.clinic_name,
        phone: form.phone,
        email: form.email,
        address: form.address,
        n8n_webhook_url: form.n8n_webhook_url,
        n8n_enabled: form.n8n_enabled,
      })
      .eq('id', 1)
      .select('*')
      .single();
    if (saved) setSettings(saved as Settings);
    try {
      const fnUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/n8n-proxy`;
      const res = await fetch(fnUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
        },
        body: JSON.stringify({
          event_type: 'test.ping',
          webhook_url: form.n8n_webhook_url,
          payload: { message: 'اختبار اتصال من عيادة الأسنان', timestamp: new Date().toISOString() },
        }),
      });
      if (res.ok) {
        setTestResult('تم إرسال الحدث التجريبي بنجاح');
        push('تم إرسال الحدث التجريبي');
      } else {
        const txt = await res.text();
        setTestResult(`فشل (${res.status}): ${txt.slice(0, 120)}`);
        push('فشل الإرسال', 'error');
      }
    } catch (e) {
      setTestResult(e instanceof Error ? e.message : String(e));
      push('فشل الاتصال', 'error');
    } finally {
      setTesting(false);
      loadEvents();
    }
  };

  if (!form) return <div className="text-center text-slate-400">جارٍ تحميل الإعدادات...</div>;

  const tabs = [
    { id: 'clinic' as const, label: 'بيانات العيادة' },
    { id: 'webhook' as const, label: 'تكامل n8n' },
    { id: 'log' as const, label: 'سجل الأحداث' },
  ];

  return (
    <div className="space-y-5">
      <div className="flex gap-1 rounded-lg bg-slate-100 p-1">
        {tabs.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`flex-1 rounded-md px-3 py-1.5 text-sm font-semibold transition-colors ${
              tab === t.id ? 'bg-white text-teal-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'clinic' && (
        <div className="card max-w-2xl space-y-4 p-6">
          <div>
            <label className="label">اسم العيادة</label>
            <input value={form.clinic_name} onChange={(e) => setForm({ ...form, clinic_name: e.target.value })} className="input" />
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label className="label">رقم الهاتف</label>
              <input value={form.phone ?? ''} onChange={(e) => setForm({ ...form, phone: e.target.value })} className="input" />
            </div>
            <div>
              <label className="label">البريد الإلكتروني</label>
              <input value={form.email ?? ''} onChange={(e) => setForm({ ...form, email: e.target.value })} className="input" />
            </div>
          </div>
          <div>
            <label className="label">العنوان</label>
            <input value={form.address ?? ''} onChange={(e) => setForm({ ...form, address: e.target.value })} className="input" />
          </div>
          <button onClick={save} disabled={saving} className="btn-primary">
            {saving ? <Spinner className="h-4 w-4" /> : <Save className="h-4 w-4" />} حفظ الإعدادات
          </button>
        </div>
      )}

      {tab === 'webhook' && (
        <div className="card max-w-2xl space-y-5 p-6">
          <div className="flex items-center gap-2 border-b border-slate-100 pb-3">
            <Webhook className="h-5 w-5 text-teal-600" />
            <h3 className="text-base font-bold text-slate-800">تكامل n8n Webhook</h3>
          </div>
          <div className="rounded-xl bg-blue-50 p-4 text-sm text-blue-800 ring-1 ring-blue-200">
            عند إنشاء موعد أو فاتورة جديدة أو تحديث حالتها، يرسل النظام حدثًا تلقائيًا إلى عنوان n8n webhook الذي تُدخله هنا. يُمرَّر الطلب عبر خادم آمن (Edge Function) لتفادي قيود المتصفح.
          </div>
          <div>
            <label className="label">عنوان n8n Webhook URL</label>
            <input
              value={form.n8n_webhook_url ?? ''}
              onChange={(e) => setForm({ ...form, n8n_webhook_url: e.target.value })}
              placeholder="https://n8n.example.com/webhook/xxx"
              className="input"
              dir="ltr"
            />
          </div>
          <label className="flex items-center gap-3 rounded-xl border border-slate-200 p-3 cursor-pointer">
            <input
              type="checkbox"
              checked={form.n8n_enabled}
              onChange={(e) => setForm({ ...form, n8n_enabled: e.target.checked })}
              className="h-4 w-4 rounded border-slate-300 text-teal-600 focus:ring-teal-500"
            />
            <div>
              <p className="text-sm font-semibold text-slate-700">تفعيل إرسال الأحداث</p>
              <p className="text-xs text-slate-500">عند التعطيل، تُسجَّل الأحداث كـ "متخطاة" ولا تُرسل.</p>
            </div>
          </label>
          <div className="flex flex-wrap gap-2">
            <button onClick={save} disabled={saving} className="btn-primary">
              {saving ? <Spinner className="h-4 w-4" /> : <Save className="h-4 w-4" />} حفظ
            </button>
            <button onClick={sendTest} disabled={testing} className="btn-secondary">
              {testing ? <Spinner className="h-4 w-4" /> : <Send className="h-4 w-4" />} إرسال حدث تجريبي
            </button>
          </div>
          {testResult && (
            <div
              className={`rounded-xl px-4 py-3 text-sm font-semibold ${
                testResult.includes('فشل') ? 'bg-rose-50 text-rose-700 ring-1 ring-rose-200' : 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200'
              }`}
            >
              {testResult}
            </div>
          )}
          <div className="rounded-xl bg-slate-50 p-4 text-xs text-slate-600">
            <p className="mb-2 font-bold text-slate-700">الأحداث المُرسَلة:</p>
            <ul className="space-y-1">
              <li><code className="rounded bg-white px-1.5 py-0.5">appointment.created</code> — عند حجز موعد جديد</li>
              <li><code className="rounded bg-white px-1.5 py-0.5">appointment.completed</code> — عند إكمال موعد</li>
              <li><code className="rounded bg-white px-1.5 py-0.5">invoice.created</code> — عند إنشاء فاتورة</li>
              <li><code className="rounded bg-white px-1.5 py-0.5">invoice.paid</code> — عند سداد فاتورة</li>
            </ul>
          </div>
        </div>
      )}

      {tab === 'log' && (
        <div className="card">
          <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
            <h3 className="flex items-center gap-2 text-base font-bold text-slate-800">
              <Activity className="h-5 w-5 text-teal-600" /> سجل أحداث الـ webhook
            </h3>
            <button onClick={loadEvents} className="text-sm font-semibold text-teal-600 hover:text-teal-700">تحديث</button>
          </div>
          <div className="p-4">
            {loadingEvents ? (
              <div className="flex justify-center py-8"><Spinner className="h-6 w-6 text-slate-400" /></div>
            ) : events.length === 0 ? (
              <EmptyState icon={<Activity className="h-10 w-10" />} title="لا أحداث بعد" description="ستظهر هنا الأحداث المرسلة إلى n8n" />
            ) : (
              <div className="space-y-2">
                {events.map((e) => (
                  <div key={e.id} className="rounded-xl border border-slate-100 px-4 py-3">
                    <div className="flex items-center justify-between">
                      <code className="rounded bg-slate-100 px-2 py-0.5 text-sm font-bold text-slate-700" dir="ltr">{e.event_type}</code>
                      <div className="flex items-center gap-2">
                        {e.status === 'sent' && <CheckCircle2 className="h-4 w-4 text-emerald-500" />}
                        {e.status === 'failed' && <XCircle className="h-4 w-4 text-rose-500" />}
                        {e.status === 'pending' && <Clock className="h-4 w-4 text-slate-400" />}
                        <span className="text-xs text-slate-500">{formatDateTime(e.created_at)}</span>
                      </div>
                    </div>
                    {e.response && (
                      <p className="mt-1.5 text-xs text-slate-500 line-clamp-2" dir="ltr">{e.response}</p>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
