import { useEffect, useState } from 'react';
import { Save, Webhook, Activity, Send, CheckCircle2, XCircle, Clock, Code2, Copy, Server } from 'lucide-react';
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
  const [tab, setTab] = useState<'clinic' | 'webhook' | 'api' | 'log'>('clinic');
  const apiUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/clinic-api`;
  const [copied, setCopied] = useState<string | null>(null);

  const copyText = (text: string, label: string) => {
    navigator.clipboard?.writeText(text);
    setCopied(label);
    setTimeout(() => setCopied(null), 1500);
  };

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
    { id: 'api' as const, label: 'واجهة API' },
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

      {tab === 'api' && (
        <div className="card max-w-3xl space-y-5 p-6">
          <div className="flex items-center gap-2 border-b border-slate-100 pb-3">
            <Server className="h-5 w-5 text-teal-600" />
            <h3 className="text-base font-bold text-slate-800">واجهة برمجية (API) لسحب البيانات من n8n</h3>
          </div>
          <div className="rounded-xl bg-blue-50 p-4 text-sm text-blue-800 ring-1 ring-blue-200">
            استخدم هذه العناوين داخل عقدة HTTP Request في n8n لسحب بيانات الخدمات والمرضى مباشرةً من قاعدة بيانات العيادة. كل الطلبات بصيغة <code className="rounded bg-white px-1">GET</code> وتُرجع JSON.
          </div>

          {/* Base URL */}
          <div>
            <label className="label">عنوان الأساسي للـ API</label>
            <div className="flex items-center gap-2">
              <input value={apiUrl} readOnly dir="ltr" className="input flex-1 font-mono text-xs" />
              <button onClick={() => copyText(apiUrl, 'base')} className="btn-secondary whitespace-nowrap">
                {copied === 'base' ? <CheckCircle2 className="h-4 w-4 text-emerald-600" /> : <Copy className="h-4 w-4" />}
                نسخ
              </button>
            </div>
          </div>

          {/* Services endpoint */}
          <div className="rounded-xl border border-slate-200 p-4">
            <div className="mb-2 flex items-center gap-2">
              <Code2 className="h-4 w-4 text-teal-600" />
              <h4 className="text-sm font-bold text-slate-800">سحب كل الخدمات</h4>
              <span className="badge bg-emerald-50 text-emerald-700 ring-emerald-200">GET</span>
            </div>
            <div className="flex items-center gap-2">
              <input value={`${apiUrl}/services`} readOnly dir="ltr" className="input flex-1 font-mono text-xs" />
              <button onClick={() => copyText(`${apiUrl}/services`, 'services')} className="btn-secondary whitespace-nowrap">
                {copied === 'services' ? <CheckCircle2 className="h-4 w-4 text-emerald-600" /> : <Copy className="h-4 w-4" />}
                نسخ
              </button>
            </div>
            <p className="mt-2 text-xs text-slate-500">يُرجع قائمة بكل خدمات العيادة مع الاسم، السعر، المدة، التصنيف.</p>
            <div className="mt-2 rounded-lg bg-slate-50 p-2.5 text-xs text-slate-600" dir="ltr">
              <span className="text-slate-400"># معاملات اختيارية:</span><br />
              ?category=cleaning &nbsp; ?q=تنظيف &nbsp; ?limit=50
            </div>
          </div>

          {/* Patients list endpoint */}
          <div className="rounded-xl border border-slate-200 p-4">
            <div className="mb-2 flex items-center gap-2">
              <Code2 className="h-4 w-4 text-teal-600" />
              <h4 className="text-sm font-bold text-slate-800">سحب قائمة المرضى</h4>
              <span className="badge bg-emerald-50 text-emerald-700 ring-emerald-200">GET</span>
            </div>
            <div className="flex items-center gap-2">
              <input value={`${apiUrl}/patients`} readOnly dir="ltr" className="input flex-1 font-mono text-xs" />
              <button onClick={() => copyText(`${apiUrl}/patients`, 'patients')} className="btn-secondary whitespace-nowrap">
                {copied === 'patients' ? <CheckCircle2 className="h-4 w-4 text-emerald-600" /> : <Copy className="h-4 w-4" />}
                نسخ
              </button>
            </div>
            <p className="mt-2 text-xs text-slate-500">يُرجع قائمة المرضى (الاسم، الهاتف، الجنس) كمصفوفة مباشرة في الجذر.</p>
          </div>

          {/* Booking endpoint — register patient + book appointment */}
          <div className="rounded-xl border-2 border-teal-200 bg-teal-50/50 p-4">
            <div className="mb-2 flex items-center gap-2">
              <Code2 className="h-4 w-4 text-teal-600" />
              <h4 className="text-sm font-bold text-slate-800">تسجيل مريض + حجز ميعاد</h4>
              <span className="badge bg-amber-100 text-amber-700 ring-amber-300">POST</span>
              <span className="badge bg-teal-100 text-teal-700 ring-teal-300">رئيسي</span>
            </div>
            <div className="flex items-center gap-2">
              <input value={`${apiUrl}/bookings`} readOnly dir="ltr" className="input flex-1 font-mono text-xs" />
              <button onClick={() => copyText(`${apiUrl}/bookings`, 'bookings')} className="btn-secondary whitespace-nowrap">
                {copied === 'bookings' ? <CheckCircle2 className="h-4 w-4 text-emerald-600" /> : <Copy className="h-4 w-4" />}
                نسخ
              </button>
            </div>
            <p className="mt-2 text-xs text-slate-600">
              ينشئ المريض في السجل إن لم يكن موجودًا (يطابق بالهاتف أولًا ثم بالاسم)، يحجز الميعاد، ويتحقق أن الميعاد فاضي على مستوى العيادة كلها مع <strong>ساعة فاصلة</strong> قبل وبعد كل ميعاد. لو فيه أي حجز قريب من الميعاد المطلوب بأقل من ساعة، يُرفض الحجز.
            </p>
            <div className="mt-2 rounded-lg bg-white p-2.5 text-xs text-slate-600">
              <span className="font-bold text-slate-700">الحقول المطلوبة:</span>
              <ul className="mt-1 list-inside list-disc space-y-0.5">
                <li><code className="rounded bg-slate-100 px-1" dir="ltr">patient_name</code> — اسم المريض</li>
                <li><code className="rounded bg-slate-100 px-1" dir="ltr">service</code> — اسم أو معرّف الخدمة (بحث جزئي)</li>
                <li><code className="rounded bg-slate-100 px-1" dir="ltr">start_time</code> — تاريخ ووقت (ISO 8601 أو عربي مثل "غدًا 10 صباحًا")</li>
              </ul>
              <span className="mt-2 block font-bold text-slate-700">حقول اختيارية:</span>
              <ul className="mt-1 list-inside list-disc space-y-0.5">
                <li><code className="rounded bg-slate-100 px-1" dir="ltr">patient_phone</code> — رقم الهاتف (للمطابقة أو إنشاء المريض)</li>
                <li><code className="rounded bg-slate-100 px-1" dir="ltr">notes</code> — ملاحظات على الحجز</li>
              </ul>
            </div>
            <div className="mt-2 rounded-lg bg-amber-50 border border-amber-200 p-2.5 text-xs text-amber-800">
              <strong>قاعدة الميعاد:</strong> بين كل ميعاد في العيادة ساعة فاصلة على الأقل قبل وبعد. لو الميعاد المطلوب أقل من ساعة من أي حجز آخر، هيُرفض برسالة "الميعاد مش متاح".
            </div>
            <div className="mt-2 rounded-lg bg-slate-900 p-2.5 text-[11px] text-slate-200" dir="ltr">
              <p className="text-slate-400">// مثال (مريض موجود بالفعل):</p>
              <pre className="overflow-x-auto whitespace-pre">{`POST /bookings
{
  "patient_name": "زياد",
  "patient_phone": "0124478545",
  "service": "تنظيف",
  "start_time": "2026-10-26T10:00:00"
}`}</pre>
              <p className="mt-2 text-slate-400">// مثال (مريض جديد — يُسجل تلقائيًا):</p>
              <pre className="overflow-x-auto whitespace-pre">{`POST /bookings
{
  "patient_name": "محمد علي",
  "patient_phone": "01234567890",
  "service": "حشو",
  "start_time": "غدا 12 ظهرا",
  "notes": "أول زيارة"
}`}</pre>
              <p className="mt-2 text-slate-400">// استجابة (تم الحجز):</p>
              <pre className="overflow-x-auto whitespace-pre">{`{
  "ok": true,
  "patient": { "id": "...", "name": "زياد", "phone": "0124478545" },
  "appointment": {
    "id": "...",
    "service_name": "تنظيف الأسنان",
    "start_time": "2026-10-26T10:00:00Z",
    "end_time": "2026-10-26T10:45:00Z",
    "status": "scheduled"
  }
}`}</pre>
              <p className="mt-2 text-slate-400">// استجابة (الميعاد مش متاح):</p>
              <pre className="overflow-x-auto whitespace-pre">{`{
  "error": "الميعاد مش متاح — يوجد حجز آخر قريب...",
  "requested_slot": { "start_time": "...", "end_time": "..." },
  "conflicting_appointment": { "start_time": "...", "end_time": "..." }
}`}</pre>
            </div>
          </div>

          {/* Example response */}
          <div className="rounded-xl bg-slate-900 p-4 text-xs text-slate-200" dir="ltr">
            <p className="mb-2 font-bold text-slate-400">// مثال /services (مصفوفة مباشرة في الجذر):</p>
            <pre className="overflow-x-auto whitespace-pre text-[11px] leading-relaxed">{`[
  {
    "id": "a11f536d-...",
    "name": "تنظيف الأسنان",
    "description": "إزالة الجير وتلميع الأسنان",
    "duration_min": 45,
    "price": 250
  },
  {
    "id": "b32e280f-...",
    "name": "حشو تجويف",
    "description": "حشو مركب لتسوس الأسنان",
    "duration_min": 60,
    "price": 300
  }
]`}</pre>
          </div>

          {/* n8n setup instructions */}
          <div className="rounded-xl bg-slate-50 p-4 text-sm text-slate-700">
            <p className="mb-2 font-bold text-slate-800">طريقة الاستخدام في n8n:</p>
            <ol className="list-inside list-decimal space-y-1 text-xs text-slate-600">
              <li>أضف عقدة <strong>HTTP Request</strong> في الـ workflow</li>
              <li>للسحب: Method = <code className="rounded bg-white px-1">GET</code>، URL = <code className="rounded bg-white px-1" dir="ltr">.../services</code></li>
              <li>للحجز: Method = <code className="rounded bg-white px-1">POST</code>، URL = <code className="rounded bg-white px-1" dir="ltr">.../bookings</code>، Body = JSON</li>
              <li>لا حاجة لمفاتيح أو مصادقة — الـ API عام ومفتوح</li>
              <li>ستجد البيانات في <code className="rounded bg-white px-1">$json</code></li>
              <li>الحجز يُسجّل المريض تلقائيًا إن لم يكن موجودًا، ويتحقق من توفر الميعاد على مستوى العيادة كلها</li>
            </ol>
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
