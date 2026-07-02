// StageOS · 采购 provider 抽象层 v3.1 · 只读 + fallback hardening
// LocalCatalogProvider（本地目录）与 HttpProvider（通用壳，默认不启用）。
// 所有 HTTP 异常都不抛出到 UI，一律 fallback 到 LocalCatalogProvider，并附带 warningCode。

import { matchCandidates, type PlanItem, type MatchContext } from "./procurementMatch";
import type { Candidate } from "./procurementCatalog";

export type ProcurementProviderMode = "local" | "http";
// 展示用 provider 徽章 id：local / http / fallback-local
export type ProviderDisplayId = "local" | "http" | "fallback-local";

export type ProviderWarningCode =
  | "HTTP_NOT_CONFIGURED"
  | "HTTP_UNAUTHORIZED"       // 401
  | "HTTP_FORBIDDEN"          // 403
  | "HTTP_TIMEOUT"
  | "HTTP_NETWORK"
  | "HTTP_NON_JSON"
  | "HTTP_SCHEMA_INVALID"
  | "HTTP_EMPTY_CANDIDATES"
  | "HTTP_STATUS"             // 其他非 2xx
  | "LOCAL_ERROR";

const WARNING_MESSAGES: Record<ProviderWarningCode, string> = {
  HTTP_NOT_CONFIGURED: "远程采购 provider 未配置 endpoint，已回退到本地候选目录。",
  HTTP_UNAUTHORIZED: "远程采购 provider 未授权 (401)，已回退到本地候选目录。",
  HTTP_FORBIDDEN: "远程采购 provider 拒绝访问 (403)，已回退到本地候选目录。",
  HTTP_TIMEOUT: "远程采购 provider 请求超时，已回退到本地候选目录。",
  HTTP_NETWORK: "远程采购 provider 网络异常，已回退到本地候选目录。",
  HTTP_NON_JSON: "远程采购 provider 返回非 JSON 内容，已回退到本地候选目录。",
  HTTP_SCHEMA_INVALID: "远程采购 provider 返回结构不合法，已回退到本地候选目录。",
  HTTP_EMPTY_CANDIDATES: "远程采购 provider 返回空候选，已回退到本地候选目录。",
  HTTP_STATUS: "远程采购 provider 状态码异常，已回退到本地候选目录。",
  LOCAL_ERROR: "本地候选目录匹配异常。",
};

export type ProviderSearchResult = {
  candidates: Candidate[];
  providerMode: ProcurementProviderMode; // 用户选择的原始模式
  providerId: ProviderDisplayId;         // 展示徽章 id
  fallbackUsed: boolean;
  warningCode?: ProviderWarningCode;
  warning?: string;
};

export interface ProcurementProvider {
  id: "local" | "http";
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

function isValidCandidate(x: any): x is Candidate {
  return !!x
    && typeof x === "object"
    && typeof x.platform === "string"
    && typeof x.title === "string"
    && typeof x.keyword === "string"
    && typeof x.estimatedPrice === "number"
    && typeof x.matchReason === "string"
    && typeof x.riskNote === "string";
}

// 内部使用：将 HTTP 异常抽象为 warningCode
class HttpProviderError extends Error {
  constructor(public code: ProviderWarningCode, msg?: string) {
    super(msg ?? code);
  }
}

export function makeHttpProvider(url: string): ProcurementProvider {
  return {
    id: "http",
    label: "HTTP (预留)",
    async search(item, ctx) {
      if (!url) throw new HttpProviderError("HTTP_NOT_CONFIGURED");
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), 4000);
      let res: Response;
      try {
        res = await fetch(url, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ item, ctx }),
          signal: ctrl.signal,
        });
      } catch (e: any) {
        if (e?.name === "AbortError") throw new HttpProviderError("HTTP_TIMEOUT");
        throw new HttpProviderError("HTTP_NETWORK", e?.message);
      } finally {
        clearTimeout(timer);
      }

      if (res.status === 401) throw new HttpProviderError("HTTP_UNAUTHORIZED");
      if (res.status === 403) throw new HttpProviderError("HTTP_FORBIDDEN");
      if (!res.ok) throw new HttpProviderError("HTTP_STATUS", `HTTP ${res.status}`);

      const raw = await res.text();
      let json: any;
      try {
        json = JSON.parse(raw);
      } catch {
        throw new HttpProviderError("HTTP_NON_JSON");
      }
      if (!json || typeof json !== "object" || !Array.isArray(json.candidates)) {
        throw new HttpProviderError("HTTP_SCHEMA_INVALID");
      }
      const arr: Candidate[] = json.candidates.filter(isValidCandidate).slice(0, 3);
      if (arr.length === 0) {
        // 区分 schema 合法但空 vs schema 不合法
        if (json.candidates.length > 0) throw new HttpProviderError("HTTP_SCHEMA_INVALID");
        throw new HttpProviderError("HTTP_EMPTY_CANDIDATES");
      }
      return arr;
    },
  };
}

const MODE_KEY = "stageos.procurement.providerMode";
const URL_KEY = "stageos.procurement.httpUrl";

export function getProviderMode(): ProcurementProviderMode {
  if (typeof localStorage === "undefined") return "local";
  const v = localStorage.getItem(MODE_KEY);
  return v === "http" ? "http" : "local";
}

export function setProviderMode(v: ProcurementProviderMode) {
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
  const mode = getProviderMode();

  if (mode === "local") {
    try {
      const c = await LocalCatalogProvider.search(item, ctx);
      return {
        candidates: c,
        providerMode: "local",
        providerId: "local",
        fallbackUsed: false,
      };
    } catch (e: any) {
      // 极端兜底：本地目录异常仍再跑一次同步匹配
      return {
        candidates: matchCandidates(item, ctx),
        providerMode: "local",
        providerId: "local",
        fallbackUsed: false,
        warningCode: "LOCAL_ERROR",
        warning: `${WARNING_MESSAGES.LOCAL_ERROR}(${e?.message ?? "unknown"})`,
      };
    }
  }

  // http primary
  const http = makeHttpProvider(getHttpUrl());
  try {
    const c = await http.search(item, ctx);
    return {
      candidates: c,
      providerMode: "http",
      providerId: "http",
      fallbackUsed: false,
    };
  } catch (e: any) {
    const code: ProviderWarningCode = e instanceof HttpProviderError
      ? e.code
      : "HTTP_NETWORK";
    return {
      candidates: matchCandidates(item, ctx),
      providerMode: "http",
      providerId: "fallback-local",
      fallbackUsed: true,
      warningCode: code,
      warning: WARNING_MESSAGES[code],
    };
  }
}

export function describeWarningCode(code: ProviderWarningCode): string {
  return WARNING_MESSAGES[code];
}
