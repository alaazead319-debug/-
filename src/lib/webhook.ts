import { supabase } from './supabase';
import type { Settings } from './types';

/**
 * Dispatch an event to the configured n8n webhook via the edge function proxy.
 * Also logs every attempt to the webhook_events table.
 */
export async function dispatchWebhook(
  eventType: string,
  payload: Record<string, unknown>,
  settings: Settings | null,
): Promise<{ ok: boolean; message: string }> {
  // Log pending event regardless
  const { data: logRow } = await supabase
    .from('webhook_events')
    .insert({ event_type: eventType, payload: payload as never, status: 'pending' })
    .select('id')
    .single();

  const logId = logRow?.id as string | undefined;

  if (!settings || !settings.n8n_enabled || !settings.n8n_webhook_url) {
    if (logId) {
      await supabase
        .from('webhook_events')
        .update({ status: 'skipped', response: 'n8n غير مفعّل أو لا يوجد عنوان webhook' })
        .eq('id', logId);
    }
    return { ok: false, message: 'n8n غير مفعّل — تم تجاهل الحدث' };
  }

  try {
    const fnUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/n8n-proxy`;
    const res = await fetch(fnUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
      },
      body: JSON.stringify({
        event_type: eventType,
        webhook_url: settings.n8n_webhook_url,
        payload,
      }),
    });

    if (!res.ok) {
      const txt = await res.text();
      if (logId) {
        await supabase.from('webhook_events').update({ status: 'failed', response: txt }).eq('id', logId);
      }
      return { ok: false, message: `فشل الإرسال (${res.status})` };
    }

    const data = await res.json().catch(() => ({}));
    if (logId) {
      await supabase
        .from('webhook_events')
        .update({ status: 'sent', response: typeof data === 'string' ? data : JSON.stringify(data) })
        .eq('id', logId);
    }
    return { ok: true, message: 'تم إرسال الحدث إلى n8n' };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (logId) {
      await supabase.from('webhook_events').update({ status: 'failed', response: msg }).eq('id', logId);
    }
    return { ok: false, message: 'فشل الاتصال بخادم n8n' };
  }
}
