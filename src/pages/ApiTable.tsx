import { useCallback, useEffect, useMemo, useState } from 'react';
import { Table2, RefreshCw, Download, Search, ChevronDown, Copy, CheckCircle2, Server, ExternalLink } from 'lucide-react';
import type { Settings } from '../lib/types';
import { SERVICE_CATEGORIES } from '../lib/types';
import { useToast } from '../components/Toast';
import { Spinner } from '../components/ui';

type Sheet = 'services' | 'patients';

type Row = Record<string, unknown>;

type ColDef = {
  key: string;
  label: string;
  type: 'text' | 'number' | 'price' | 'badge' | 'category';
  width?: string;
};

const SERVICE_COLS: ColDef[] = [
  { key: 'index', label: '#', type: 'number', width: 'w-12' },
  { key: 'name', label: 'اسم الخدمة', type: 'text' },
  { key: 'description', label: 'الوصف', type: 'text' },
  { key: 'category', label: 'التصنيف', type: 'category' },
  { key: 'duration_label', label: 'المدة', type: 'text', width: 'w-28' },
  { key: 'price', label: 'السعر', type: 'price', width: 'w-32' },
];

const PATIENT_COLS: ColDef[] = [
  { key: 'index', label: '#', type: 'number', width: 'w-12' },
  { key: 'name', label: 'اسم المريض', type: 'text' },
  { key: 'phone', label: 'الهاتف', type: 'text', width: 'w-36' },
  { key: 'gender', label: 'الجنس', type: 'badge', width: 'w-24' },
];

export function ApiTable({ settings }: { settings: Settings | null }) {
  const { push } = useToast();
  const [sheet, setSheet] = useState<Sheet>('services');
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [copiedUrl, setCopiedUrl] = useState(false);

  const apiUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/clinic-api`;

  const fetchSheet = useCallback(
    async (s: Sheet) => {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch(`${apiUrl}/${s}`, {
          headers: { Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}` },
        });
        if (!res.ok) {
          throw new Error(`فشل الطلب (${res.status})`);
        }
        const json = await res.json();
        // API returns a bare array at the root by default; fall back to
        // the object envelope if present (?format=object).
        const isEnvelope = json && typeof json === 'object' && !Array.isArray(json);
        const dataKey = s === 'services' ? 'services' : 'patients';
        const list = (isEnvelope ? (json?.[dataKey] as Row[]) : (json as Row[])) ?? [];
        setRows(list.map((r, i) => ({ ...r, index: i + 1 })));
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        setError(msg);
        setRows([]);
      } finally {
        setLoading(false);
      }
    },
    [apiUrl],
  );

  useEffect(() => {
    fetchSheet(sheet);
  }, [sheet, fetchSheet]);

  const cols = sheet === 'services' ? SERVICE_COLS : PATIENT_COLS;

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((r) =>
      Object.values(r).some((v) => String(v ?? '').toLowerCase().includes(q)),
    );
  }, [rows, query]);

  const exportCsv = () => {
    const headers = cols.map((c) => c.label).join(',');
    const lines = filtered.map((r) =>
      cols
        .map((c) => {
          const v = r[c.key] ?? '';
          const s = String(v).replace(/"/g, '""');
          return /[",\n]/.test(s) ? `"${s}"` : s;
        })
        .join(','),
    );
    const csv = '\uFEFF' + [headers, ...lines].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${sheet === 'services' ? 'الخدمات' : 'المرضى'}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    push('تم تصدير الملف بصيغة CSV');
  };

  const copyUrl = () => {
    navigator.clipboard?.writeText(`${apiUrl}/${sheet}`);
    setCopiedUrl(true);
    setTimeout(() => setCopiedUrl(false), 1500);
    push('تم نسخ عنوان الـ API');
  };

  const renderCell = (col: ColDef, row: Row) => {
    const val = row[col.key];
    if (col.type === 'price') {
      const n = Number(val ?? 0);
      return <span className="font-bold text-teal-700">{n.toLocaleString('ar-EG', { maximumFractionDigits: 2 })} ر.س</span>;
    }
    if (col.type === 'badge') {
      if (col.key === 'gender') {
        return val === 'male' ? (
          <span className="badge bg-blue-50 text-blue-700 ring-blue-200">ذكر</span>
        ) : (
          <span className="badge bg-pink-50 text-pink-700 ring-pink-200">أنثى</span>
        );
      }
      return <span className="badge bg-slate-100 text-slate-600 ring-slate-200">{String(val ?? '')}</span>;
    }
    if (col.type === 'category') {
      const label = SERVICE_CATEGORIES[String(val ?? '')] ?? String(val ?? '');
      return <span className="badge bg-teal-50 text-teal-700 ring-teal-200">{label}</span>;
    }
    if (col.key === 'description') {
      return <span className="text-slate-500 line-clamp-1">{String(val ?? '') || '—'}</span>;
    }
    return String(val ?? '');
  };

  return (
    <div className="space-y-5">
      {/* Header banner */}
      <div className="card overflow-hidden">
        <div className="flex flex-col gap-3 p-5 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-gradient-to-br from-teal-400 to-teal-600 text-white shadow-md">
              <Table2 className="h-6 w-6" />
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-800">جدول البيانات من الـ API</h2>
              <p className="text-xs text-slate-500">
                البيانات مستدعاة مباشرة من <code className="rounded bg-slate-100 px-1.5 py-0.5" dir="ltr">clinic-api</code> — مثل جدول جوجل شيت
              </p>
            </div>
          </div>
          <a
            href={apiUrl}
            target="_blank"
            rel="noreferrer"
            className="btn-secondary text-xs"
          >
            <ExternalLink className="h-3.5 w-3.5" /> فتح الـ API الخام
          </a>
        </div>
      </div>

      {/* Controls */}
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex gap-1 rounded-lg bg-slate-100 p-1">
          <button
            onClick={() => setSheet('services')}
            className={`flex items-center gap-1.5 rounded-md px-3.5 py-1.5 text-sm font-semibold transition-colors ${
              sheet === 'services' ? 'bg-white text-teal-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'
            }`}
          >
            <Server className="h-4 w-4" /> الخدمات
          </button>
          <button
            onClick={() => setSheet('patients')}
            className={`flex items-center gap-1.5 rounded-md px-3.5 py-1.5 text-sm font-semibold transition-colors ${
              sheet === 'patients' ? 'bg-white text-teal-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'
            }`}
          >
            <Server className="h-4 w-4" /> المرضى
          </button>
        </div>

        <div className="flex flex-1 flex-col gap-2 sm:flex-row sm:items-center sm:justify-end">
          <div className="relative flex-1 sm:max-w-xs">
            <Search className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="ابحث في الجدول..."
              className="input pr-9"
            />
          </div>
          <button
            onClick={() => copyUrl()}
            className="btn-secondary whitespace-nowrap"
            title="نسخ عنوان الـ API"
          >
            {copiedUrl ? <CheckCircle2 className="h-4 w-4 text-emerald-600" /> : <Copy className="h-4 w-4" />}
            نسخ الرابط
          </button>
          <button onClick={exportCsv} className="btn-secondary whitespace-nowrap">
            <Download className="h-4 w-4" /> CSV
          </button>
          <button onClick={() => fetchSheet(sheet)} className="btn-secondary whitespace-nowrap">
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} /> تحديث
          </button>
        </div>
      </div>

      {/* Stats line */}
      <div className="flex flex-wrap items-center gap-4 text-xs text-slate-500">
        <span className="flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-full bg-emerald-500" />
          <strong className="text-slate-700">{loading ? '...' : filtered.length}</strong> صف معروض
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-full bg-slate-300" />
          الإجمالي: <strong className="text-slate-700">{loading ? '...' : rows.length}</strong>
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-full bg-blue-500" />
          <code className="rounded bg-slate-100 px-1.5 py-0.5" dir="ltr">GET {apiUrl}/{sheet}</code>
        </span>
        {settings?.n8n_enabled && (
          <span className="flex items-center gap-1.5 text-emerald-600">
            <span className="h-2 w-2 rounded-full bg-emerald-500" /> n8n مفعّل
          </span>
        )}
      </div>

      {/* The Google-Sheets-style table */}
      <div className="card overflow-hidden">
        {error ? (
          <div className="p-8 text-center">
            <p className="text-sm font-semibold text-rose-600">{error}</p>
            <button onClick={() => fetchSheet(sheet)} className="btn-secondary mt-3">إعادة المحاولة</button>
          </div>
        ) : loading ? (
          <div className="flex h-64 items-center justify-center">
            <Spinner className="h-7 w-7 text-slate-400" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="p-10 text-center text-sm text-slate-400">
            {query ? 'لا نتائج مطابقة للبحث' : 'لا توجد بيانات في هذا الجدول بعد'}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-sm">
              {/* Header row — Google Sheets style (sticky, gray) */}
              <thead>
                <tr className="sticky top-0 z-10 bg-slate-100 text-xs font-bold text-slate-600">
                  {cols.map((c) => (
                    <th
                      key={c.key}
                      className={`border-b-2 border-slate-300 border-l border-slate-200 px-3 py-2 text-right ${c.width ?? ''}`}
                    >
                      <div className="flex items-center gap-1">
                        {c.label}
                        <ChevronDown className="h-3 w-3 text-slate-400" />
                      </div>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.map((row, i) => (
                  <tr
                    key={i}
                    className={`border-l border-slate-200 transition-colors hover:bg-blue-50/60 ${
                      i % 2 === 1 ? 'bg-slate-50/40' : 'bg-white'
                    }`}
                  >
                    {cols.map((c) => (
                      <td
                        key={c.key}
                        className={`border-b border-l border-slate-200 px-3 py-2 text-right ${c.width ?? ''} ${
                          c.key === 'index' ? 'text-center text-xs font-bold text-slate-400' : ''
                        }`}
                      >
                        {c.key === 'index' ? String(i + 1) : renderCell(c, row)}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* n8n rows hint */}
      <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-900">
        <p className="mb-1.5 font-bold text-emerald-800">لإدخال البيانات في Google Sheets داخل n8n:</p>
        <p className="mb-2 text-xs">الاستجابة من الـ API تحتوي حقل <code className="rounded bg-white px-1.5 py-0.5" dir="ltr">rows</code> — وهو مصفوفة صفوف جاهزة للصق مباشرة: أول صف = عناوين الأعمدة، وبعده صفوف القيم.</p>
        <pre className="overflow-x-auto rounded-lg bg-emerald-900/90 p-3 text-[11px] text-emerald-100" dir="ltr">{`{
  "rows": [
    ["#", "الاسم", "الوصف", "التصنيف", "المدة", "السعر"],
    [1, "تنظيف الأسنان", "إزالة الجير", "cleaning", 45, 250],
    [2, "حشو تجويف", "حشو مركب", "restoration", 60, 300]
  ]
}`}</pre>
        <p className="mt-2 text-xs">في عقدة <strong>Google Sheets → Append Row</strong> داخل n8n، اضبط القيمة على <code className="rounded bg-white px-1.5 py-0.5" dir="ltr">{`{{ $json.rows }}`}</code> ليتم لصق كل الصفوف دفعة واحدة.</p>
      </div>

      {/* Footer note */}
      <div className="rounded-xl bg-slate-100 p-4 text-xs text-slate-600">
        <p className="mb-1 font-bold text-slate-700">هذا الجدول مرتبط مباشرة بقاعدة بيانات العيادة:</p>
        <ul className="list-inside list-disc space-y-0.5">
          <li>أي خدمة أو مريض جديد يُضاف من صفحات النظام يظهر هنا فورًا عند التحديث.</li>
          <li>استخدم زر "نسخ الرابط" للحصول على عنوان الـ API للاستخدام داخل n8n.</li>
          <li>زر "CSV" يصدّر الجدول المعروض حاليًا كملف Excel/CSV.</li>
          <li>الاستجابة تحتوي <code className="rounded bg-white px-1 px-1" dir="ltr">rows</code> (صفوف جاهزة) و<code className="rounded bg-white px-1" dir="ltr">services</code>/<code className="rounded bg-white px-1" dir="ltr">patients</code> (كائنات JSON).</li>
        </ul>
      </div>
    </div>
  );
}
