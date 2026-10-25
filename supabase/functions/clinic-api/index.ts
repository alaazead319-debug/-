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
    // Route: /clinic-api/services  (the function name prefix is added by the platform)
    const pathname = url.pathname.replace(/\/$/, '');
    const segments = pathname.split('/').filter(Boolean);
    const resource = segments[segments.length - 1] ?? 'services';

    // ----- /services : list all services (optionally filtered by category) -----
    if (resource === 'services') {
      const category = url.searchParams.get('category');
      const q = url.searchParams.get('q');
      const limit = Math.min(Number(url.searchParams.get('limit') ?? '200'), 500);

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
      return new Response(
        JSON.stringify({
          ok: true,
          count: services.length,
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

    // ----- /patients : list patients (name + phone only) -----
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
      return new Response(
        JSON.stringify({ ok: true, count: (data ?? []).length, patients: data ?? [] }),
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
