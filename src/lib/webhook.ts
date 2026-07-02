// v4.1 · Outbound Webhook Layer + HMAC signature & replay protection
// - Async fire-and-forget delivery (never blocks / never throws to caller).
// - Up to 2 retries (3 attempts total) with small backoff.
// - Silently logs successes/failures to `webhook_delivery_logs`.
// - v4.1: HMAC-SHA256 signing (Stripe-style scheme) and per-request nonce for replay defense.
import { supabase } from "@/integrations/supabase/client";
import { SETTINGS_SAFE_COLUMNS } from "@/lib/settingsColumns";
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
  /** v4.1: signing secret. Empty string ⇒ send unsigned (backwards compatible with v4.0 receivers). */
  webhookSecret: string;
};

export const WEBHOOK_SETTINGS_DEFAULTS: WebhookSettings = {
  webhookEnabled: false,
  webhookUrl: "",
  webhookEvents: [],
  webhookSecret: "",
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
    webhookSecret: String(row?.webhookSecret ?? row?.webhook_secret ?? fallback.webhookSecret ?? ""),
  };
}

export async function loadWebhookSettings(): Promise<WebhookSettings> {
  try {
    const { data } = await supabase.from("settings").select(SETTINGS_SAFE_COLUMNS).eq("id", "global").maybeSingle();
    if (data) {
      // webhook_secret is admin-only; fetch it via the secure RPC (returns null for non-admins).
      const { data: secret } = await supabase.rpc("get_webhook_secret" as any);
      const merged = normalizeWebhookSettings({ ...data, webhook_secret: secret ?? "" }, readLocalWebhookSettings());
      saveLocalWebhookSettings(merged);
      return merged;
    }
  } catch { /* ignore */ }
  return readLocalWebhookSettings();
}

// ---------- v4.1: signing helpers ----------

/** Generate a fresh, cryptographically strong signing secret. */
export function generateWebhookSecret(bytes = 32): string {
  const buf = new Uint8Array(bytes);
  crypto.getRandomValues(buf);
  return "whsec_" + Array.from(buf, (b) => b.toString(16).padStart(2, "0")).join("");
}

function generateNonce(): string {
  const buf = new Uint8Array(16);
  crypto.getRandomValues(buf);
  return Array.from(buf, (b) => b.toString(16).padStart(2, "0")).join("");
}

function toHex(buf: ArrayBuffer): string {
  const view = new Uint8Array(buf);
  let out = "";
  for (let i = 0; i < view.length; i++) out += view[i].toString(16).padStart(2, "0");
  return out;
}

/**
 * Compute HMAC-SHA256(secret, `${timestamp}.${nonce}.${body}`) as hex.
 * Signed string prefix mirrors Stripe/Svix conventions so receivers stay simple.
 */
export async function signWebhook(secret: string, timestamp: string, nonce: string, body: string): Promise<string> {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(`${timestamp}.${nonce}.${body}`));
  return toHex(sig);
}

// ---------- payload ----------

export type WebhookPayload = {
  event: WebhookEvent;
  timestamp: string;
  /** v4.1: unique per-delivery id; receivers should reject reuse within their freshness window. */
  nonce: string;
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

type PostResult = { ok: boolean; status?: number; error?: string };

async function postOnce(
  url: string,
  payload: WebhookPayload,
  secret: string,
  timeoutMs = 4000,
): Promise<PostResult> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const body = JSON.stringify(payload);
    const headers: Record<string, string> = {
      "content-type": "application/json",
      "x-stageos-event": payload.event,
      "x-stageos-version": STAGEOS_VERSION,
      "x-stageos-timestamp": payload.timestamp,
      "x-stageos-nonce": payload.nonce,
    };
    if (secret) {
      const sig = await signWebhook(secret, payload.timestamp, payload.nonce, body);
      // Stripe-style header: scheme version + hex digest. Receivers verify by recomputing.
      headers["x-stageos-signature"] = `t=${payload.timestamp},n=${payload.nonce},v1=${sig}`;
    }
    const res = await fetch(url, {
      method: "POST",
      headers,
      body,
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
 * - v4.1: signs each request and includes a fresh nonce so receivers can defend against replay.
 */
export function dispatchWebhook(
  event: WebhookEvent,
  ctx: { project_id?: string | null; summary?: Record<string, any> } = {},
): void {
  queueMicrotask(async () => {
    try {
      const settings = await loadWebhookSettings();
      const { data: userData } = await supabase.auth.getUser();
      const uid = userData.user?.id ?? null;

      const payload: WebhookPayload = {
        event,
        timestamp: new Date().toISOString(),
        nonce: generateNonce(),
        user_id: uid,
        project_id: ctx.project_id ?? null,
        baseline: STAGEOS_VERSION,
        summary: ctx.summary ?? {},
      };

      if (!settings.webhookEnabled || !settings.webhookUrl || !settings.webhookEvents.includes(event)) {
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
        // Fresh nonce per retry: legitimate replays must not collide with the first attempt's nonce
        // in receiver-side replay caches, and lets receivers keep a strict single-use policy.
        if (attempt > 1) {
          payload.nonce = generateNonce();
          payload.timestamp = new Date().toISOString();
        }
        const res = await postOnce(settings.webhookUrl, payload, settings.webhookSecret);
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
