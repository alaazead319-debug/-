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
    // ?format=object keeps the old envelope; default is a bare array at the root.
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

      // Bare array of objects: [{ id, name, description, duration_min, price }, ...]
      // price is a JS number; description is null when absent.
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

      // Default: bare array at the root.
      return new Response(JSON.stringify(services), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
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
          services: 'GET /functions/v1/clinic-api/services?category=&q=&limit=&format=',
          patients: 'GET /functions/v1/clinic-api/patients?format=',
        },
        note: 'افتراضيًا يُرجع مصفوفة مباشرة في الجذر. استخدم ?format=object للحصول على غلاف { ok, count, services }.',
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
