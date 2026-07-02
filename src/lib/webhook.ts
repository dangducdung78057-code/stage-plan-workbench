// v4.0 · Outbound Webhook Layer
// - Async fire-and-forget delivery (never blocks / never throws to caller).
// - Up to 2 retries (3 attempts total) with small backoff.
// - Silently logs successes/failures to `webhook_delivery_logs`.
import { supabase } from "@/integrations/supabase/client";
import { STAGEOS_VERSION } from "@/lib/stageos";

export type WebhookEvent =
  | "export.created"
  | "audit.completed"
  | "procurement.completed";

export const WEBHOOK_EVENT_META: Record<WebhookEvent, { label: string; desc: string }> = {
  "export.created": { label: "export.created", desc: "Markdown / PDF / PNG 导出成功后触发" },
  "audit.completed": { label: "audit.completed", desc: "一键验收完成后触发" },
  "procurement.completed": { label: "procurement.completed", desc: "采购候选生成完成后触发" },
};

export const WEBHOOK_EVENTS = Object.keys(WEBHOOK_EVENT_META) as WebhookEvent[];

export type WebhookSettings = {
  webhookEnabled: boolean;
  webhookUrl: string;
  webhookEvents: WebhookEvent[];
};

export const WEBHOOK_SETTINGS_DEFAULTS: WebhookSettings = {
  webhookEnabled: false,
  webhookUrl: "",
  webhookEvents: [],
};

const LS_KEY = "stageos.webhook.settings.v1";

export function readLocalWebhookSettings(): WebhookSettings {
  try {
    const raw = typeof window !== "undefined" ? window.localStorage.getItem(LS_KEY) : null;
    if (!raw) return { ...WEBHOOK_SETTINGS_DEFAULTS };
    const p = JSON.parse(raw);
    return normalizeWebhookSettings(p, WEBHOOK_SETTINGS_DEFAULTS);
  } catch {
    return { ...WEBHOOK_SETTINGS_DEFAULTS };
  }
}

export function saveLocalWebhookSettings(s: WebhookSettings) {
  try {
    if (typeof window !== "undefined") window.localStorage.setItem(LS_KEY, JSON.stringify(s));
  } catch { /* ignore */ }
}

export function normalizeWebhookSettings(row: any, fallback: WebhookSettings = WEBHOOK_SETTINGS_DEFAULTS): WebhookSettings {
  const rawEvents = row?.webhookEvents ?? row?.webhook_events ?? fallback.webhookEvents ?? [];
  const events = Array.isArray(rawEvents)
    ? (rawEvents.filter((e) => WEBHOOK_EVENTS.includes(e as WebhookEvent)) as WebhookEvent[])
    : [];
  return {
    webhookEnabled: Boolean(row?.webhookEnabled ?? row?.webhook_enabled ?? fallback.webhookEnabled),
    webhookUrl: String(row?.webhookUrl ?? row?.webhook_url ?? fallback.webhookUrl ?? ""),
    webhookEvents: events,
  };
}

export async function loadWebhookSettings(): Promise<WebhookSettings> {
  try {
    const { data } = await supabase.from("settings").select("*").eq("id", "global").maybeSingle();
    if (data) {
      const merged = normalizeWebhookSettings(data, readLocalWebhookSettings());
      saveLocalWebhookSettings(merged);
      return merged;
    }
  } catch { /* ignore */ }
  return readLocalWebhookSettings();
}

export type WebhookPayload = {
  event: WebhookEvent;
  timestamp: string;
  user_id: string | null;
  project_id: string | null;
  baseline: string;
  summary: Record<string, any>;
};

async function insertLog(row: {
  user_id: string;
  event: WebhookEvent;
  url: string;
  status: "success" | "failed" | "skipped";
  http_status?: number | null;
  attempt: number;
  error?: string | null;
  project_id?: string | null;
  payload?: any;
}) {
  try {
    await supabase.from("webhook_delivery_logs").insert(row as any);
  } catch { /* silent */ }
}

async function postOnce(url: string, body: WebhookPayload, timeoutMs = 4000): Promise<{ ok: boolean; status?: number; error?: string }> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-stageos-event": body.event,
        "x-stageos-version": STAGEOS_VERSION,
      },
      body: JSON.stringify(body),
      signal: ctrl.signal,
      mode: "cors",
    });
    if (!res.ok) return { ok: false, status: res.status, error: `HTTP ${res.status}` };
    return { ok: true, status: res.status };
  } catch (e: any) {
    return { ok: false, error: e?.message ?? "network error" };
  } finally {
    clearTimeout(t);
  }
}

/**
 * Fire-and-forget outbound webhook dispatch.
 * - Never throws.
 * - Never blocks the caller's promise chain in a meaningful way.
 * - Retries up to 2 times on failure (3 attempts total) with short backoff.
 */
export function dispatchWebhook(
  event: WebhookEvent,
  ctx: { project_id?: string | null; summary?: Record<string, any> } = {},
): void {
  // Schedule asynchronously so the caller's flow is never blocked.
  queueMicrotask(async () => {
    try {
      const settings = await loadWebhookSettings();
      const { data: userData } = await supabase.auth.getUser();
      const uid = userData.user?.id ?? null;

      const payload: WebhookPayload = {
        event,
        timestamp: new Date().toISOString(),
        user_id: uid,
        project_id: ctx.project_id ?? null,
        baseline: STAGEOS_VERSION,
        summary: ctx.summary ?? {},
      };

      if (!settings.webhookEnabled || !settings.webhookUrl || !settings.webhookEvents.includes(event)) {
        // Not configured for this event — silently skip; still log for auditability if user is authed.
        if (uid) {
          void insertLog({
            user_id: uid,
            event,
            url: settings.webhookUrl || "(unset)",
            status: "skipped",
            attempt: 0,
            error: !settings.webhookEnabled
              ? "webhookEnabled=false"
              : !settings.webhookUrl
                ? "webhookUrl empty"
                : "event not subscribed",
            project_id: payload.project_id,
            payload,
          });
        }
        return;
      }

      let lastError: string | null = null;
      let lastStatus: number | null = null;
      for (let attempt = 1; attempt <= 3; attempt++) {
        const res = await postOnce(settings.webhookUrl, payload);
        lastStatus = res.status ?? null;
        if (res.ok) {
          if (uid) {
            void insertLog({
              user_id: uid,
              event,
              url: settings.webhookUrl,
              status: "success",
              http_status: res.status ?? null,
              attempt,
              project_id: payload.project_id,
              payload,
            });
          }
          return;
        }
        lastError = res.error ?? "unknown";
        if (attempt < 3) {
          await new Promise((r) => setTimeout(r, 200 * attempt));
        }
      }

      if (uid) {
        void insertLog({
          user_id: uid,
          event,
          url: settings.webhookUrl,
          status: "failed",
          http_status: lastStatus,
          attempt: 3,
          error: lastError,
          project_id: payload.project_id,
          payload,
        });
      }
    } catch {
      // Never propagate. Never toast. Silent by design.
    }
  });
}
