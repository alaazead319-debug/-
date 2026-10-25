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

interface ServiceForBookingRow {
  id: string;
  name: string;
  duration_min: number;
  price: number;
}

interface BookingInput {
  patient_name?: string;
  patient_phone?: string | null;
  service?: string;
  start_time?: string;
  notes?: string | null;
}

interface PatientLiteRow {
  id: string;
  name: string;
  phone: string | null;
}

interface ExistingApptRow {
  id: string;
  start_time: string;
  end_time: string;
  status: string;
}

const HOUR_MS = 60 * 60 * 1000;
const RE_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Parse a start time string. Accepts:
// - ISO 8601: "2026-10-26T10:00:00" or "2026-10-26 10:00"
// - Arabic-friendly relative phrases (best-effort):
//   "غدًا 10", "بكرة 3 عصرًا", "اليوم 5", "النهاردة 6 مساءً"
// Throws on invalid input.
function parseStartTime(raw: string): number {
  const s = raw.trim();
  if (!s) throw new Error('empty');

  const direct = new Date(s);
  if (!isNaN(direct.getTime())) return direct.getTime();

  const norm = s
    .replace(/[إأآا]/g, 'ا')
    .replace(/ى/g, 'ي')
    .replace(/ة/g, 'ه')
    .replace(/\s+/g, ' ')
    .trim();

  const now = new Date();
  let baseDate = new Date(now);

  let dayOffset = 0;
  if (/(غدا|بكره|بكرة|بكر|نهارده|النهارده|اليوم|بعد بكر|بعد غد)/.test(norm)) {
    if (/(بعد بكر|بعد غد)/.test(norm)) dayOffset = 2;
    else if (/(غدا|بكر)/.test(norm)) dayOffset = 1;
    else dayOffset = 0;
    baseDate.setDate(baseDate.getDate() + dayOffset);
  }

  const timeMatch = norm.match(/(\d{1,2})(?::(\d{2}))?\s*(صباح|ص|عصر|مغرب|مساء|م)?/);
  if (timeMatch) {
    let hour = parseInt(timeMatch[1], 10);
    const minute = timeMatch[2] ? parseInt(timeMatch[2], 10) : 0;
    const period = timeMatch[3] ?? '';
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

function json(data: unknown, status: number): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  if (req.method !== 'GET' && req.method !== 'POST') {
    return json({ error: 'Method not allowed. Use GET or POST.' }, 405);
  }

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
    );

    const url = new URL(req.url);
    const pathname = url.pathname.replace(/\/$/, '');
    const segments = pathname.split('/').filter(Boolean);
    const apiIdx = segments.findIndex((s) => s === 'clinic-api');
    const path = apiIdx >= 0 ? segments.slice(apiIdx + 1) : segments;
    const resource = path[0] ?? 'services';
    const wantEnvelope = url.searchParams.get('format') === 'object';

    // ----- GET /services -----
    if (req.method === 'GET' && resource === 'services') {
      const category = url.searchParams.get('category');
      const q = url.searchParams.get('q');
      const limit = Math.min(Number(url.searchParams.get('limit') ?? '1000'), 1000);

      let query = supabase.from('services').select('*').order('name', { ascending: true }).limit(limit);
      if (category) query = query.eq('category', category);
      if (q) query = query.ilike('name', `%${q}%`);

      const { data, error } = await query;
      if (error) return json({ error: error.message }, 500);

      const services = ((data as ServiceRow[]) ?? []).map((s) => ({
        id: s.id,
        name: s.name,
        description: s.description,
        duration_min: s.duration_min,
        price: Number(s.price),
      }));

      if (wantEnvelope) {
        return json({ ok: true, count: services.length, services }, 200);
      }
      return json(services, 200);
    }

    // ----- POST /bookings — register patient + book appointment -----
    // Body: { patient_name, patient_phone?, service, start_time, notes? }
    // - Creates the patient if not found (matches by phone exactly, or by name).
    // - Resolves service by UUID or partial name.
    // - Checks availability across the WHOLE clinic: no existing non-cancelled
    //   appointment may overlap the requested slot padded by 1 hour on each
    //   side (minimum 1-hour gap between appointments).
    // - Inserts the appointment and returns it.
    if (req.method === 'POST' && resource === 'bookings') {
      let body: BookingInput;
      try {
        body = (await req.json()) as BookingInput;
      } catch {
        return json({ error: 'الجسم غير صالح (JSON متوقع)' }, 400);
      }

      const patientName = (body.patient_name ?? '').trim();
      const patientPhone = body.patient_phone?.trim() || null;
      const serviceQuery = (body.service ?? '').trim();
      const startTimeRaw = (body.start_time ?? '').trim();
      const notes = body.notes ?? null;

      if (!patientName) {
        return json({ error: 'حقل "patient_name" مطلوب (اسم المريض)' }, 400);
      }
      if (!serviceQuery) {
        return json({ error: 'حقل "service" مطلوب (اسم أو معرّف الخدمة)' }, 400);
      }
      if (!startTimeRaw) {
        return json({ error: 'حقل "start_time" مطلوب (تاريخ ووقت الحجز)' }, 400);
      }

      // --- Resolve or create patient ---
      // Match by exact phone first (if provided), else by exact name.
      let patient: PatientLiteRow | null = null;
      let pErr: unknown = null;

      if (patientPhone) {
        const r = await supabase
          .from('patients')
          .select('id, name, phone')
          .or(`phone.eq.${patientPhone},phone.eq.${patientPhone.replace(/\s|-|\(|\)/g, '')}`)
          .limit(1);
        pErr = r.error;
        patient = ((r.data as PatientLiteRow[] | null) ?? [])[0] ?? null;
      }

      if (!patient && !pErr) {
        const r = await supabase
          .from('patients')
          .select('id, name, phone')
          .ilike('name', patientName)
          .limit(1);
        pErr = r.error;
        patient = ((r.data as PatientLiteRow[] | null) ?? [])[0] ?? null;
      }

      if (pErr) {
        return json({ error: (pErr as { message?: string }).message ?? String(pErr) }, 500);
      }

      // Not found → create a new patient record.
      if (!patient) {
        const insertRow: { name: string; phone?: string | null } = { name: patientName };
        if (patientPhone) insertRow.phone = patientPhone;
        const ins = await supabase
          .from('patients')
          .insert(insertRow)
          .select('id, name, phone')
          .maybeSingle();
        if (ins.error) {
          return json({ error: 'فشل إنشاء المريض: ' + ins.error.message }, 500);
        }
        patient = (ins.data as PatientLiteRow | null) ?? null;
      }

      if (!patient) {
        return json({ error: 'تعذّر تسجيل المريض' }, 500);
      }

      // --- Resolve service ---
      let service: ServiceForBookingRow | null = null;
      let sErr: unknown = null;

      if (RE_UUID.test(serviceQuery)) {
        const r = await supabase
          .from('services')
          .select('id, name, duration_min, price')
          .eq('id', serviceQuery)
          .maybeSingle();
        sErr = r.error;
        service = (r.data as ServiceForBookingRow | null) ?? null;
      } else {
        const r = await supabase
          .from('services')
          .select('id, name, duration_min, price')
          .ilike('name', `%${serviceQuery}%`)
          .limit(1);
        sErr = r.error;
        service = ((r.data as ServiceForBookingRow[] | null) ?? [])[0] ?? null;
      }

      if (sErr) {
        return json({ error: (sErr as { message?: string }).message ?? String(sErr) }, 500);
      }
      if (!service) {
        return json({ error: 'الخدمة غير موجودة', service_query: serviceQuery }, 404);
      }

      // --- Parse start_time ---
      let startMs: number;
      try {
        startMs = parseStartTime(startTimeRaw);
      } catch {
        return json(
          { error: 'صيغة start_time غير صالحة', start_time: startTimeRaw, hint: 'استخدم ISO 8601 مثل 2026-10-26T10:00:00' },
          400,
        );
      }
      const startTimeIso = new Date(startMs).toISOString();
      const endTimeIso = new Date(startMs + service.duration_min * 60_000).toISOString();

      // --- Availability check across the whole clinic ---
      // The requested slot padded by 1 hour on each side must be free of any
      // non-cancelled appointment. This guarantees a minimum 1-hour gap before
      // and after every appointment.
      const gapStartIso = new Date(startMs - HOUR_MS).toISOString();
      const gapEndIso = new Date(startMs + service.duration_min * 60_000 + HOUR_MS).toISOString();

      const conflictRes = await supabase
        .from('appointments')
        .select('id, start_time, end_time, status')
        .neq('status', 'cancelled')
        .or(`and(start_time.lt.${gapEndIso},end_time.gt.${gapStartIso})`)
        .order('start_time', { ascending: true })
        .limit(50);

      if (conflictRes.error) {
        return json({ error: 'فشل التحقق من التوفر: ' + conflictRes.error.message }, 500);
      }

      const existing = (conflictRes.data as ExistingApptRow[]) ?? [];
      if (existing.length > 0) {
        const first = existing[0];
        return json(
          {
            error: 'الميعاد مش متاح — يوجد حجز آخر قريب من هذا الوقت (يجب أن يكون بين كل ميعاد ساعة فاصلة على الأقل)',
            requested_slot: { start_time: startTimeIso, end_time: endTimeIso },
            conflicting_appointment: { start_time: first.start_time, end_time: first.end_time, status: first.status },
            gap_required: 'ساعة قبل وبعد كل ميعاد',
          },
          409,
        );
      }

      // --- Insert appointment ---
      const insertRow = {
        patient_id: patient.id,
        service_id: service.id,
        start_time: startTimeIso,
        end_time: endTimeIso,
        status: 'scheduled',
        notes: notes ?? null,
      };

      const insRes = await supabase
        .from('appointments')
        .insert(insertRow)
        .select('id, patient_id, service_id, start_time, end_time, status, notes, created_at')
        .maybeSingle();

      if (insRes.error) {
        return json({ error: 'فشل إنشاء الحجز: ' + insRes.error.message }, 500);
      }
      const appt = insRes.data as {
        id: string;
        patient_id: string;
        service_id: string;
        start_time: string;
        end_time: string;
        status: string;
        notes: string | null;
        created_at: string;
      };

      return json(
        {
          ok: true,
          patient: {
            id: patient.id,
            name: patient.name,
            phone: patient.phone,
          },
          appointment: {
            id: appt.id,
            patient_id: appt.patient_id,
            service_id: appt.service_id,
            service_name: service.name,
            start_time: appt.start_time,
            end_time: appt.end_time,
            status: appt.status,
            notes: appt.notes,
            created_at: appt.created_at,
          },
        },
        201,
      );
    }

    // ----- root: docs -----
    return json(
      {
        ok: true,
        endpoints: {
          'GET /services': 'كل الخدمات (مصفوفة كائنات)',
          'GET /services?category=cleaning&q=تنظيف&limit=50': 'فلترة الخدمات',
          'POST /bookings': 'تسجيل مريض (إنشاؤه إن لم يكن موجودًا) + حجز ميعاد مع التحقق من التوفر وساعة فاصلة بين كل ميعاد',
        },
        booking_hint:
          'POST /bookings مثال: {"patient_name":"زياد","patient_phone":"0124478545","service":"تنظيف","start_time":"2026-10-26T10:00:00"} — ينشئ المريض لو مش موجود، ويتحقق إن الميعاد فاضي على مستوى العيادة كلها مع ساعة فاصلة قبل وبعد كل ميعاد',
      },
      200,
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return json({ error: msg }, 500);
  }
});
