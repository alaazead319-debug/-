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

interface ServiceForBookingRow {
  id: string;
  name: string;
  duration_min: number;
  price: number;
}

interface BookingInput {
  patient?: string;
  service?: string;
  start_time?: string;
  notes?: string | null;
  status?: string;
  auto_create_patient?: boolean;
  patient_phone?: string | null;
}

interface AppointmentInsertRow {
  patient_id: string;
  service_id: string;
  start_time: string;
  end_time: string;
  status: string;
  notes?: string | null;
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

// Parse a start time string. Accepts:
// - ISO 8601: "2026-10-26T10:00:00" or "2026-10-26 10:00"
// - Date + time: "2026-10-26 10:00"
// - Arabic-friendly relative phrases (best-effort):
//   "غدًا 10", "بكرة 3 عصرًا", "اليوم 5", "النهاردة 6 مساءً"
// Throws on invalid input.
function parseStartTime(raw: string): number {
  const s = raw.trim();
  if (!s) throw new Error('empty');

  // Try ISO / date-time first.
  const direct = new Date(s);
  if (!isNaN(direct.getTime())) return direct.getTime();

  // Normalize Arabic.
  const norm = s
    .replace(/[إأآا]/g, 'ا')
    .replace(/ى/g, 'ي')
    .replace(/ة/g, 'ه')
    .replace(/\s+/g, ' ')
    .trim();

  const now = new Date();
  let baseDate = new Date(now);

  // Detect relative day.
  let dayOffset = 0;
  if (/(غدا|بكره|بكرة|بكر|نهارده|النهارده|اليوم)/.test(norm)) {
    if (/(غدا|بكر)/.test(norm)) dayOffset = 1;
    else if (/(النهارده|اليوم|نهارده)/.test(norm)) dayOffset = 0;
    else if (/(بعد بكر|بعد غد)/.test(norm)) dayOffset = 2;
    baseDate.setDate(baseDate.getDate() + dayOffset);
  }

  // Extract hour. Handles "10", "10 صباحًا", "3 عصرًا", "6 مساءً", "10:30".
  const timeMatch = norm.match(/(\d{1,2})(?::(\d{2}))?\s*(صباح|ص|عصر|مغرب|مساء|م)?/);
  if (timeMatch) {
    let hour = parseInt(timeMatch[1], 10);
    const minute = timeMatch[2] ? parseInt(timeMatch[2], 10) : 0;
    const period = timeMatch[3] ?? '';
    // Convert 12-hour to 24-hour if period indicates PM.
    if (/(مساء|م|مغرب|عصر)/.test(period)) {
      if (hour < 12) hour += 12;
    } else if (/(صباح|ص)/.test(period)) {
      if (hour === 12) hour = 0;
    }
    baseDate.setHours(hour, minute, 0, 0);
    return baseDate.getTime();
  }

  throw new Error('could not parse: ' + s);
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  if (req.method !== 'GET' && req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed. Use GET or POST.' }), {
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

    // ----- /patients/:query  (single patient file, minimal summary) -----
    // One URL works for id, phone, or name — auto-detected. No ?by= needed.
    // Accepts the query in the path segment OR as ?q= (query param is more
    // robust for AI agents because it avoids path-encoding issues with
    // Arabic text and spaces).
    if (resource === 'patients' && (resourceId || url.searchParams.get('q'))) {
      // Prefer ?q= (already URL-decoded by URLSearchParams); fall back to path.
      let q = url.searchParams.get('q') ?? resourceId ?? '';
      try {
        q = decodeURIComponent(q);
      } catch {
        // already decoded
      }
      q = q.trim();
      // ?by= overrides auto-detection if explicitly provided (kept for back-compat).
      const by = url.searchParams.get('by');

      if (!q) {
        return new Response(JSON.stringify({ error: 'أدخل اسم أو رقم أو معرّف المريض' }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      // Auto-detection order: UUID → phone (exact) → name (partial).
      const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(q);
      const looksLikePhone = /^[+0-9\s()-]{4,20}$/.test(q);

      const lookupBy: 'id' | 'phone' | 'name' =
        by === 'phone' ? 'phone' : by === 'name' ? 'name' : by === 'id' ? 'id' : isUuid ? 'id' : looksLikePhone ? 'phone' : 'name';

      // Run the appropriate query. For name/phone we fetch with .limit(1)
      // so we can inspect the SQL error (if any) before deciding not-found.
      let pData: PatientFullRow | null = null;
      let pErr: unknown = null;

      if (lookupBy === 'id') {
        const r = await supabase.from('patients').select('*').eq('id', q).maybeSingle();
        pData = (r.data as PatientFullRow | null) ?? null;
        pErr = r.error;
      } else if (lookupBy === 'phone') {
        const r = await supabase
          .from('patients')
          .select('*')
          .or(`phone.eq.${q},phone.eq.${q.replace(/\s|-|\(|\)/g, '')}`)
          .limit(1);
        pErr = r.error;
        pData = ((r.data as PatientFullRow[] | null) ?? [])[0] ?? null;
      } else {
        const r = await supabase
          .from('patients')
          .select('*')
          .ilike('name', `%${q}%`)
          .limit(1);
        pErr = r.error;
        pData = ((r.data as PatientFullRow[] | null) ?? [])[0] ?? null;
      }

      if (pErr) {
        return new Response(JSON.stringify({ error: (pErr as { message?: string }).message ?? String(pErr) }), {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      if (!pData) {
        return new Response(
          JSON.stringify({ error: 'المريض غير موجود', query: q, looked_by: lookupBy }),
          { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
        );
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

    // ----- POST /bookings — create an appointment -----
    // Body: { patient, service, start_time, notes?, status?, auto_create_patient?, patient_phone? }
    // - patient: UUID, phone, or name (auto-detected, same logic as /patients)
    // - service: UUID or service name (partial match)
    // - start_time: ISO 8601 (e.g. "2026-10-26T10:00:00") or Arabic-friendly
    //   "غدًا الساعة 10" / "بكرة 3 عصرًا" — best-effort parse.
    // - auto_create_patient: if true and patient not found by phone/name,
    //   create a new patient record (name = patient, phone = patient_phone?).
    // Returns the created appointment with patient + service names.
    if (req.method === 'POST' && resource === 'bookings') {
      let body: BookingInput;
      try {
        body = (await req.json()) as BookingInput;
      } catch {
        return new Response(JSON.stringify({ error: 'الجسم غير صالح (JSON متوقع)' }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      const patientQuery = (body.patient ?? '').trim();
      const serviceQuery = (body.service ?? '').trim();
      const startTimeRaw = (body.start_time ?? '').trim();
      const notes = body.notes ?? null;
      const requestedStatus = body.status ?? 'scheduled';
      const autoCreate = body.auto_create_patient === true;
      const patientPhone = body.patient_phone?.trim() || null;

      if (!patientQuery) {
        return new Response(JSON.stringify({ error: 'حقل "patient" مطلوب (اسم أو رقم أو معرّف المريض)' }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      if (!serviceQuery) {
        return new Response(JSON.stringify({ error: 'حقل "service" مطلوب (اسم أو معرّف الخدمة)' }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      if (!startTimeRaw) {
        return new Response(JSON.stringify({ error: 'حقل "start_time" مطلوب (تاريخ ووقت الحجز)' }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      // --- Resolve patient ---
      const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(patientQuery);
      const looksLikePhone = /^[+0-9\s()-]{4,20}$/.test(patientQuery);
      const pLookupBy = isUuid ? 'id' : looksLikePhone ? 'phone' : 'name';

      let patientId: string | null = null;
      let patientName: string | null = null;
      let pErr: unknown = null;

      if (pLookupBy === 'id') {
        const r = await supabase.from('patients').select('id, name').eq('id', patientQuery).maybeSingle();
        pErr = r.error;
        if (r.data) { patientId = (r.data as { id: string }).id; patientName = (r.data as { name: string }).name; }
      } else if (pLookupBy === 'phone') {
        const r = await supabase.from('patients').select('id, name').or(`phone.eq.${patientQuery},phone.eq.${patientQuery.replace(/\s|-|\(|\)/g, '')}`).limit(1);
        pErr = r.error;
        const row = ((r.data as ({ id: string; name: string }[] | null) ?? [])[0]);
        if (row) { patientId = row.id; patientName = row.name; }
      } else {
        const r = await supabase.from('patients').select('id, name').ilike('name', `%${patientQuery}%`).limit(1);
        pErr = r.error;
        const row = ((r.data as ({ id: string; name: string }[] | null) ?? [])[0]);
        if (row) { patientId = row.id; patientName = row.name; }
      }

      if (pErr) {
        return new Response(JSON.stringify({ error: (pErr as { message?: string }).message ?? String(pErr) }), {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      // Patient not found — optionally auto-create.
      if (!patientId && autoCreate) {
        // Use the provided name as-is; if it looked like a phone, use a placeholder name.
        const newName = pLookupBy === 'name' ? patientQuery : patientPhone ? patientQuery : patientQuery;
        const insertRow: { name: string; phone?: string | null } = { name: newName };
        if (patientPhone) insertRow.phone = patientPhone;
        else if (pLookupBy === 'phone') insertRow.phone = patientQuery;
        const ins = await supabase.from('patients').insert(insertRow).select('id, name').maybeSingle();
        if (ins.error) {
          return new Response(JSON.stringify({ error: 'فشل إنشاء المريض: ' + ins.error.message }), {
            status: 500,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }
        if (ins.data) {
          patientId = (ins.data as { id: string }).id;
          patientName = (ins.data as { name: string }).name;
        }
      }

      if (!patientId) {
        return new Response(
          JSON.stringify({
            error: 'المريض غير موجود',
            patient_query: patientQuery,
            looked_by: pLookupBy,
            hint: 'أضف "auto_create_patient": true لإنشاء مريض جديد تلقائيًا',
          }),
          { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
        );
      }

      // --- Resolve service ---
      const isServiceUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(serviceQuery);
      let service: ServiceForBookingRow | null = null;
      let sErr: unknown = null;

      if (isServiceUuid) {
        const r = await supabase.from('services').select('id, name, duration_min, price').eq('id', serviceQuery).maybeSingle();
        sErr = r.error;
        if (r.data) service = r.data as ServiceForBookingRow;
      } else {
        const r = await supabase.from('services').select('id, name, duration_min, price').ilike('name', `%${serviceQuery}%`).limit(1);
        sErr = r.error;
        service = ((r.data as ServiceForBookingRow[] | null) ?? [])[0] ?? null;
      }

      if (sErr) {
        return new Response(JSON.stringify({ error: (sErr as { message?: string }).message ?? String(sErr) }), {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      if (!service) {
        return new Response(
          JSON.stringify({ error: 'الخدمة غير موجودة', service_query: serviceQuery }),
          { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
        );
      }

      // --- Parse start_time ---
      let startMs: number;
      try {
        startMs = parseStartTime(startTimeRaw);
      } catch {
        return new Response(
          JSON.stringify({ error: 'صيغة start_time غير صالحة', start_time: startTimeRaw, hint: 'استخدم ISO 8601 مثل 2026-10-26T10:00:00' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
        );
      }
      const startTimeIso = new Date(startMs).toISOString();
      const endTimeIso = new Date(startMs + service.duration_min * 60_000).toISOString();

      // --- Conflict check: overlapping appointment for the same patient ---
      const conflictRes = await supabase
        .from('appointments')
        .select('id, start_time, end_time, status')
        .eq('patient_id', patientId)
        .neq('status', 'cancelled')
        .or(`and(start_time.lt.${endTimeIso},end_time.gt.${startTimeIso})`)
        .limit(1);
      if (conflictRes.error) {
        return new Response(JSON.stringify({ error: 'فشل التحقق من التعارض: ' + conflictRes.error.message }), {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      if ((conflictRes.data ?? []).length > 0) {
        const c = (conflictRes.data as { start_time: string; end_time: string }[])[0];
        return new Response(
          JSON.stringify({
            error: 'يوجد موعد متعارض لنفس المريض في هذا الوقت',
            conflict: { start_time: c.start_time, end_time: c.end_time },
          }),
          { status: 409, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
        );
      }

      // --- Validate status ---
      const validStatuses = ['scheduled', 'confirmed', 'completed', 'cancelled', 'no_show'];
      const finalStatus = validStatuses.includes(requestedStatus) ? requestedStatus : 'scheduled';

      // --- Insert appointment ---
      const insertRow: AppointmentInsertRow = {
        patient_id: patientId,
        service_id: service.id,
        start_time: startTimeIso,
        end_time: endTimeIso,
        status: finalStatus,
      };
      if (notes) insertRow.notes = notes;

      const insRes = await supabase.from('appointments').insert(insertRow).select('id, patient_id, service_id, start_time, end_time, status, notes, created_at').maybeSingle();
      if (insRes.error) {
        return new Response(JSON.stringify({ error: 'فشل إنشاء الحجز: ' + insRes.error.message }), {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      const appt = insRes.data as { id: string; patient_id: string; service_id: string; start_time: string; end_time: string; status: string; notes: string | null; created_at: string };

      return new Response(
        JSON.stringify({
          ok: true,
          appointment: {
            id: appt.id,
            patient_id: appt.patient_id,
            patient_name: patientName,
            service_id: appt.service_id,
            service_name: service.name,
            start_time: appt.start_time,
            end_time: appt.end_time,
            status: appt.status,
            notes: appt.notes,
            created_at: appt.created_at,
          },
        }),
        { status: 201, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    // ----- root: docs -----
    return new Response(
      JSON.stringify({
        ok: true,
        endpoints: {
          'GET /services': 'كل الخدمات (مصفوفة كائنات)',
          'GET /services?category=cleaning&q=تنظيف&limit=50': 'فلترة الخدمات',
          'GET /patients': 'قائمة المرضى (مصفوفة كائنات)',
          'GET /patients?q=<اسم|هاتف|id>': 'ملف مريض واحد (يُكتشف النوع تلقائيًا)',
          'POST /bookings': 'إنشاء حجز جديد — جسم JSON: {patient, service, start_time, notes?, status?, auto_create_patient?, patient_phone?}',
        },
        note: 'افتراضيًا يُرجع مصفوفة مباشرة في الجذر. استخدم ?format=object للغلاف. ملف المريض يكتشف النوع تلقائيًا: UUID ← هاتف ← اسم.',
        hint: 'للبحث عن مريض استخدم ?q=<الاسم أو الهاتف أو المعرّف> — مثال: /patients?q=زياد أو /patients?q=0124478545',
        booking_hint: 'POST /bookings مثال: {"patient":"زياد","service":"تنظيف","start_time":"2026-10-26T10:00:00"} — أو مع إنشاء مريض: {"patient":"محمد","patient_phone":"0123456789","service":"حشو","start_time":"2026-10-27T12:00","auto_create_patient":true}',
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
