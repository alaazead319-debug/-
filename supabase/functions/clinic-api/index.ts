import { createClient } from 'npm:@supabase/supabase-js@2.57.4';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Client-Info, Apikey',
};

interface ServiceRow {
  id: string;
  name: string;
  description: string | null;
  duration_min: number;
  price: number;
  category: string;
  created_at: string;
}

interface PatientRow {
  id: string;
  name: string;
  phone: string | null;
  gender: string;
}

// ---- Google-Sheets-compatible column layouts ----
// First element = header row, then one array per data row.
const SERVICE_COLUMNS = ['#', 'الاسم', 'الوصف', 'التصنيف', 'المدة (دقيقة)', 'السعر (ر.س)', 'تاريخ الإنشاء'];
const PATIENT_COLUMNS = ['#', 'الاسم', 'الهاتف', 'الجنس'];

function serviceToRow(s: ServiceRow, i: number): unknown[] {
  return [
    i + 1,
    s.name,
    s.description ?? '',
    s.category,
    s.duration_min,
    Number(s.price),
    s.created_at,
  ];
}

function patientToRow(p: PatientRow, i: number): unknown[] {
  return [
    i + 1,
    p.name,
    p.phone ?? '',
    p.gender,
  ];
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  if (req.method !== 'GET') {
    return new Response(JSON.stringify({ error: 'Method not allowed. Use GET.' }), {
      status: 405,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
    );

    const url = new URL(req.url);
    const pathname = url.pathname.replace(/\/$/, '');
    const segments = pathname.split('/').filter(Boolean);
    const resource = segments[segments.length - 1] ?? 'services';

    // ----- /services -----
    if (resource === 'services') {
      const category = url.searchParams.get('category');
      const q = url.searchParams.get('q');
      const limit = Math.min(Number(url.searchParams.get('limit') ?? '500'), 1000);

      let query = supabase.from('services').select('*').order('name', { ascending: true }).limit(limit);
      if (category) query = query.eq('category', category);
      if (q) query = query.ilike('name', `%${q}%`);

      const { data, error } = await query;
      if (error) {
        return new Response(JSON.stringify({ error: error.message }), {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      const services = (data as ServiceRow[]) ?? [];
      const rows: unknown[][] = [
        SERVICE_COLUMNS,
        ...services.map((s, i) => serviceToRow(s, i)),
      ];

      return new Response(
        JSON.stringify({
          ok: true,
          resource: 'services',
          count: services.length,
          columns: SERVICE_COLUMNS,
          // Array-of-rows, sheets-ready: first row is headers, then data rows.
          rows,
          // Same data as objects, for n8n nodes that prefer JSON objects.
          services: services.map((s) => ({
            id: s.id,
            name: s.name,
            description: s.description,
            duration_min: s.duration_min,
            duration_label: `${s.duration_min} دقيقة`,
            price: Number(s.price),
            price_label: `${Number(s.price).toFixed(2)} ر.س`,
            category: s.category,
            created_at: s.created_at,
          })),
        }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    // ----- /patients -----
    if (resource === 'patients') {
      const { data, error } = await supabase
        .from('patients')
        .select('id, name, phone, gender')
        .order('name', { ascending: true });
      if (error) {
        return new Response(JSON.stringify({ error: error.message }), {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      const patients = (data as PatientRow[]) ?? [];
      const rows: unknown[][] = [
        PATIENT_COLUMNS,
        ...patients.map((p, i) => patientToRow(p, i)),
      ];

      return new Response(
        JSON.stringify({
          ok: true,
          resource: 'patients',
          count: patients.length,
          columns: PATIENT_COLUMNS,
          rows,
          patients,
        }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    return new Response(
      JSON.stringify({
        ok: true,
        endpoints: {
          services: 'GET /functions/v1/clinic-api/services?category=&q=&limit=',
          patients: 'GET /functions/v1/clinic-api/patients',
        },
        note: 'الاستجابة تحتوي على حقل rows (صفوف جدول جاهزة للصق في Google Sheets داخل n8n)',
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return new Response(JSON.stringify({ error: msg }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
