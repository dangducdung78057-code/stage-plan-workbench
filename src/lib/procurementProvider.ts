// StageOS · 采购 provider 抽象层 v3.0 · 只读
// LocalCatalogProvider（本地目录）与 HttpProvider（通用壳，默认不启用）。
// 任何异常都不抛出到 UI，交由 searchWithFallback 处理。

import { matchCandidates, type PlanItem, type MatchContext } from "./procurementMatch";
import type { Candidate } from "./procurementCatalog";

export type ProcurementProviderId = "local" | "http";

export type ProviderSearchResult = {
  candidates: Candidate[];
  providerId: ProcurementProviderId;
  usedFallback: boolean;
  warning?: string;
};

export interface ProcurementProvider {
  id: ProcurementProviderId;
  label: string;
  search(item: PlanItem, ctx: MatchContext): Promise<Candidate[]>;
}

export const LocalCatalogProvider: ProcurementProvider = {
  id: "local",
  label: "本地目录",
  async search(item, ctx) {
    return matchCandidates(item, ctx);
  },
};

// 通用 HTTP 壳；预期后端返回 { candidates: Candidate[] }。
// 未配置 URL → 抛错以触发 fallback；网络/解析错误 → 抛错以触发 fallback。
export function makeHttpProvider(url: string): ProcurementProvider {
  return {
    id: "http",
    label: "HTTP (预留)",
    async search(item, ctx) {
      if (!url) throw new Error("HTTP provider 未配置 URL");
      const ctrl = new AbortController();
      const t = setTimeout(() => ctrl.abort(), 4000);
      try {
        const res = await fetch(url, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ item, ctx }),
          signal: ctrl.signal,
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const json = await res.json();
        const arr = Array.isArray(json?.candidates) ? json.candidates : [];
        if (!arr.length) throw new Error("HTTP provider 返回空候选");
        return arr.slice(0, 3) as Candidate[];
      } finally {
        clearTimeout(t);
      }
    },
  };
}

const MODE_KEY = "stageos.procurement.providerMode";
const URL_KEY = "stageos.procurement.httpUrl";

export function getProviderMode(): ProcurementProviderId {
  if (typeof localStorage === "undefined") return "local";
  const v = localStorage.getItem(MODE_KEY);
  return v === "http" ? "http" : "local";
}

export function setProviderMode(v: ProcurementProviderId) {
  localStorage.setItem(MODE_KEY, v);
  window.dispatchEvent(new CustomEvent("stageos:procurementProvider"));
}

export function getHttpUrl(): string {
  if (typeof localStorage === "undefined") return "";
  return localStorage.getItem(URL_KEY) ?? "";
}

export function setHttpUrl(v: string) {
  localStorage.setItem(URL_KEY, v);
  window.dispatchEvent(new CustomEvent("stageos:procurementProvider"));
}

export function resolveProvider(): ProcurementProvider {
  const mode = getProviderMode();
  if (mode === "http") return makeHttpProvider(getHttpUrl());
  return LocalCatalogProvider;
}

export async function searchWithFallback(
  item: PlanItem,
  ctx: MatchContext,
): Promise<ProviderSearchResult> {
  const primary = resolveProvider();
  if (primary.id === "local") {
    try {
      const c = await primary.search(item, ctx);
      return { candidates: c, providerId: "local", usedFallback: false };
    } catch (e: any) {
      return {
        candidates: matchCandidates(item, ctx),
        providerId: "local",
        usedFallback: true,
        warning: `本地目录异常: ${e?.message ?? "unknown"}`,
      };
    }
  }
  // http primary
  try {
    const c = await primary.search(item, ctx);
    return { candidates: c, providerId: "http", usedFallback: false };
  } catch (e: any) {
    return {
      candidates: matchCandidates(item, ctx),
      providerId: "local",
      usedFallback: true,
      warning: `HTTP provider 不可用，已回退本地目录: ${e?.message ?? "unknown"}`,
    };
  }
}
