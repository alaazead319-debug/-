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

interface PatientFullRow extends PatientRow {
  email: string | null;
  birth_date: string | null;
  address: string | null;
  notes: string | null;
  created_at: string;
}

interface AppointmentRow {
  id: string;
  patient_id: string;
  service_id: string | null;
  start_time: string;
  status: string;
  notes: string | null;
}

interface ServiceLiteRow {
  id: string;
  name: string;
}

interface InvoiceRow {
  id: string;
  patient_id: string;
  total: number;
  paid: number;
  status: string;
  issued_at: string;
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
    // segments like: [..., 'clinic-api', 'patients', '<id>'] OR [..., 'clinic-api', 'services']
    // Drop the function-name prefix segment if present.
    const apiIdx = segments.findIndex((s) => s === 'clinic-api');
    const path = apiIdx >= 0 ? segments.slice(apiIdx + 1) : segments;
    const resource = path[0] ?? 'services';
    const resourceId = path[1]; // for /patients/:id
    const wantEnvelope = url.searchParams.get('format') === 'object';

    // ----- /services -----
    if (resource === 'services') {
      const category = url.searchParams.get('category');
      const q = url.searchParams.get('q');
      const limit = Math.min(Number(url.searchParams.get('limit') ?? '1000'), 1000);

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

      const services = ((data as ServiceRow[]) ?? []).map((s) => ({
        id: s.id,
        name: s.name,
        description: s.description,
        duration_min: s.duration_min,
        price: Number(s.price),
      }));

      if (wantEnvelope) {
        return new Response(
          JSON.stringify({ ok: true, count: services.length, services }),
          { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
        );
      }
      return new Response(JSON.stringify(services), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // ----- /patients/:id  (single patient file, minimal summary) -----
    if (resource === 'patients' && resourceId) {
      // Resolve by id, phone, or name (?by=phone|name).
      const by = url.searchParams.get('by') ?? 'id';
      let patientQuery = supabase.from('patients').select('*');
      if (by === 'phone') patientQuery = patientQuery.eq('phone', resourceId).limit(1);
      else if (by === 'name') patientQuery = patientQuery.ilike('name', `%${resourceId}%`).limit(1);
      else patientQuery = patientQuery.eq('id', resourceId).limit(1);

      const { data: pData, error: pErr } = await patientQuery.maybeSingle();
      if (pErr) {
        return new Response(JSON.stringify({ error: pErr.message }), {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      if (!pData) {
        return new Response(JSON.stringify({ error: 'المريض غير موجود' }), {
          status: 404,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      const p = pData as PatientFullRow;

      // Fetch related appointments + invoices in parallel (best-effort).
      const [apptRes, invRes] = await Promise.all([
        supabase
          .from('appointments')
          .select('id, patient_id, service_id, start_time, status, notes')
          .eq('patient_id', p.id)
          .order('start_time', { ascending: false })
          .limit(10),
        supabase
          .from('invoices')
          .select('id, patient_id, total, paid, status, issued_at')
          .eq('patient_id', p.id)
          .order('issued_at', { ascending: false })
          .limit(10),
      ]);

      const appointments = (apptRes.data as AppointmentRow[]) ?? [];
      const invoices = (invRes.data as InvoiceRow[]) ?? [];

      // Resolve service names for appointments.
      const serviceIds = appointments
        .map((a) => a.service_id)
        .filter((s): s is string => !!s);
      let serviceMap: Record<string, string> = {};
      if (serviceIds.length > 0) {
        const { data: svcs } = await supabase
          .from('services')
          .select('id, name')
          .in('id', serviceIds);
        serviceMap = ((svcs as ServiceLiteRow[]) ?? []).reduce(
          (acc, s) => {
            acc[s.id] = s.name;
            return acc;
          },
          {} as Record<string, string>,
        );
      }

      // Age calc helper.
      const age =
        p.birth_date ? new Date().getFullYear() - new Date(p.birth_date).getFullYear() : null;

      // Financial totals.
      const totalBilled = invoices.reduce((s, i) => s + Number(i.total ?? 0), 0);
      const totalPaid = invoices.reduce((s, i) => s + Number(i.paid ?? 0), 0);
      const outstanding = Math.max(totalBilled - totalPaid, 0);

      const file = {
        id: p.id,
        name: p.name,
        phone: p.phone,
        email: p.email,
        gender: p.gender === 'male' ? 'ذكر' : 'أنثى',
        birth_date: p.birth_date,
        age,
        address: p.address,
        notes: p.notes,
        registered_at: p.created_at,
        summary: {
          appointments_count: appointments.length,
          last_visit: appointments[0]?.start_time ?? null,
          last_status: appointments[0]?.status ?? null,
          total_billed: totalBilled,
          total_paid: totalPaid,
          outstanding,
          invoices_count: invoices.length,
        },
        recent_appointments: appointments.slice(0, 5).map((a) => ({
          id: a.id,
          date: a.start_time,
          status: a.status,
          service: a.service_id ? (serviceMap[a.service_id] ?? null) : null,
          notes: a.notes,
        })),
        recent_invoices: invoices.slice(0, 5).map((i) => ({
          id: i.id,
          issued_at: i.issued_at,
          total: Number(i.total),
          paid: Number(i.paid),
          status: i.status,
        })),
      };

      return new Response(JSON.stringify(file), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // ----- /patients (list) -----
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
      const patients = ((data as PatientRow[]) ?? []).map((p) => ({
        id: p.id,
        name: p.name,
        phone: p.phone,
        gender: p.gender,
      }));

      if (wantEnvelope) {
        return new Response(
          JSON.stringify({ ok: true, count: patients.length, patients }),
          { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
        );
      }
      return new Response(JSON.stringify(patients), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // ----- root: docs -----
    return new Response(
      JSON.stringify({
        ok: true,
        endpoints: {
          'GET /services': 'كل الخدمات (مصفوفة كائنات)',
          'GET /services?category=cleaning&q=تنظيف&limit=50': 'فلترة الخدمات',
          'GET /patients': 'قائمة المرضى (مصفوفة كائنات)',
          'GET /patients/:id': 'ملف مريض مفرد بالمعرّف (الأقل للوكيل الذكي)',
          'GET /patients/<phone>?by=phone': 'ملف مريض بالهاتف',
          'GET /patients/<name>?by=name': 'ملف مريض بالاسم (بحث جزئي)',
        },
        note: 'افتراضيًا يُرجع مصفوفة مباشرة في الجذر. استخدم ?format=object للغلاف.',
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
