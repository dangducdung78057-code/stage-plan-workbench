import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export type ProcurementSettings = {
  procurementCandidatesEnabled: boolean;
  procurementProviderEnabled: boolean;
  procurementExportAttachmentEnabled: boolean;
  procurementProvider: "local" | "http";
  procurementApiBaseUrl: string;
};

export const PROCUREMENT_SETTINGS_DEFAULTS: ProcurementSettings = {
  procurementCandidatesEnabled: false,
  procurementProviderEnabled: false,
  procurementExportAttachmentEnabled: false,
  procurementProvider: "local",
  procurementApiBaseUrl: "",
};

const LOCAL_KEY = "stageos.procurement.settings.v1";
const LEGACY_MODE_KEY = "stageos.procurement.providerMode";
const LEGACY_URL_KEY = "stageos.procurement.httpUrl";

function providerValue(v: unknown): "local" | "http" {
  return v === "http" ? "http" : "local";
}

export function normalizeProcurementSettings(row: any, fallback: ProcurementSettings = PROCUREMENT_SETTINGS_DEFAULTS): ProcurementSettings {
  return {
    procurementCandidatesEnabled: Boolean(row?.procurement_candidates_enabled ?? fallback.procurementCandidatesEnabled),
    procurementProviderEnabled: Boolean(row?.procurement_provider_enabled ?? fallback.procurementProviderEnabled),
    procurementExportAttachmentEnabled: Boolean(row?.procurement_export_attachment_enabled ?? fallback.procurementExportAttachmentEnabled),
    procurementProvider: providerValue(row?.procurement_provider ?? fallback.procurementProvider),
    procurementApiBaseUrl: String(row?.procurement_api_base_url ?? fallback.procurementApiBaseUrl ?? ""),
  };
}

export function readLocalProcurementSettings(): ProcurementSettings {
  if (typeof localStorage === "undefined") return { ...PROCUREMENT_SETTINGS_DEFAULTS };
  try {
    const raw = localStorage.getItem(LOCAL_KEY);
    const parsed = raw ? JSON.parse(raw) : {};
    return {
      ...PROCUREMENT_SETTINGS_DEFAULTS,
      ...parsed,
      procurementProvider: providerValue(parsed?.procurementProvider ?? localStorage.getItem(LEGACY_MODE_KEY)),
      procurementApiBaseUrl: String(parsed?.procurementApiBaseUrl ?? localStorage.getItem(LEGACY_URL_KEY) ?? ""),
    };
  } catch {
    return { ...PROCUREMENT_SETTINGS_DEFAULTS };
  }
}

export function saveLocalProcurementSettings(settings: ProcurementSettings, notify = true) {
  if (typeof localStorage === "undefined") return;
  localStorage.setItem(LOCAL_KEY, JSON.stringify(settings));
  localStorage.setItem(LEGACY_MODE_KEY, settings.procurementProvider);
  localStorage.setItem(LEGACY_URL_KEY, settings.procurementApiBaseUrl);
  if (!notify) return;
  window.dispatchEvent(new CustomEvent("stageos:procurementSettings"));
  window.dispatchEvent(new CustomEvent("stageos:procurementProvider"));
}

export async function readProcurementSettings(): Promise<{ settings: ProcurementSettings; source: "global" | "local"; error?: string }> {
  const local = readLocalProcurementSettings();
  try {
    const { data, error } = await supabase.from("settings").select("*").eq("id", "global").maybeSingle();
    if (error) return { settings: local, source: "local", error: error.message };
    if (!data) return { settings: local, source: "local" };
    const settings = normalizeProcurementSettings(data, local);
    saveLocalProcurementSettings(settings, false);
    return { settings, source: "global" };
  } catch (e: any) {
    return { settings: local, source: "local", error: e?.message ?? "unknown" };
  }
}

export function useProcurementSettings() {
  const [settings, setSettings] = useState<ProcurementSettings>(() => readLocalProcurementSettings());

  useEffect(() => {
    let cancelled = false;
    const sync = () => {
      setSettings(readLocalProcurementSettings());
      void readProcurementSettings().then((r) => {
        if (!cancelled) setSettings(r.settings);
      });
    };
    sync();
    window.addEventListener("stageos:procurementSettings", sync);
    window.addEventListener("stageos:procurementProvider", sync);
    window.addEventListener("storage", sync);
    return () => {
      cancelled = true;
      window.removeEventListener("stageos:procurementSettings", sync);
      window.removeEventListener("stageos:procurementProvider", sync);
      window.removeEventListener("storage", sync);
    };
  }, []);

  return settings;
}

export function procurementSettingsDetail(settings: ProcurementSettings, apiMode?: string): string {
  return [
    `apiMode=${apiMode ?? "mock"}`,
    `procurementCandidates=${settings.procurementCandidatesEnabled}`,
    `procurementCandidatesEnabled=${settings.procurementCandidatesEnabled}`,
    `procurementProviderEnabled=${settings.procurementProviderEnabled}`,
    `procurementExportAttachment=${settings.procurementExportAttachmentEnabled}`,
    `procurementExportAttachmentEnabled=${settings.procurementExportAttachmentEnabled}`,
    `procurementProvider=${settings.procurementProvider}`,
  ].join(", ");
}