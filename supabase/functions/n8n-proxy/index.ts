import { createClient } from 'npm:@supabase/supabase-js@2.57.4';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Client-Info, Apikey',
};

interface ProxyRequest {
  event_type: string;
  webhook_url: string;
  payload: Record<string, unknown>;
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    if (req.method !== 'POST') {
      return new Response(JSON.stringify({ error: 'Method not allowed' }), {
        status: 405,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const body = (await req.json()) as ProxyRequest;
    const { event_type, webhook_url, payload } = body;

    if (!webhook_url || !event_type) {
      return new Response(JSON.stringify({ error: 'missing webhook_url or event_type' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Basic URL validation — must be http(s)
    let parsed: URL;
    try {
      parsed = new URL(webhook_url);
    } catch {
      return new Response(JSON.stringify({ error: 'invalid webhook_url' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      return new Response(JSON.stringify({ error: 'webhook_url must be http(s)' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Log the event attempt in the database (best-effort)
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
    );
    const outgoingPayload = {
      event: event_type,
      sent_at: new Date().toISOString(),
      data: payload,
    };

    try {
      await supabase.from('webhook_events').insert({
        event_type,
        payload: outgoingPayload as never,
        status: 'pending',
      });
    } catch {
      // Logging is best-effort; continue to send.
    }

    const upstream = await fetch(parsed.toString(), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(outgoingPayload),
      // Reasonable timeout via AbortController
      signal: AbortSignal.timeout(15000),
    });

    const responseText = await upstream.text();

    // Update log row (best-effort)
    try {
      await supabase.from('webhook_events').update({
        status: upstream.ok ? 'sent' : 'failed',
        response: responseText.slice(0, 500),
      }).order('created_at', { ascending: false }).limit(1);
    } catch {
      // ignore
    }

    if (!upstream.ok) {
      return new Response(
        JSON.stringify({ error: `upstream returned ${upstream.status}`, detail: responseText.slice(0, 200) }),
        { status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    return new Response(JSON.stringify({ ok: true, status: upstream.status }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return new Response(JSON.stringify({ error: msg }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
