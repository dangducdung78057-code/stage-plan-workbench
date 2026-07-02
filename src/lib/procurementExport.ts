// StageOS · v3.3 · 采购候选商品导出附加
// 遍历方案条目 → 走 procurementProvider（含 fallback）→ 输出用于 MD/PDF/PNG 导出的候选商品清单。
// 只读、永不抛错；HTTP 失败保持 v3.1/v3.2 fallback 行为。

import { searchWithFallback, type ProviderDisplayId, type ProviderWarningCode } from "./procurementProvider";
import type { MatchContext, PlanItem } from "./procurementMatch";
import { PLATFORM_LABELS, type Candidate } from "./procurementCatalog";

export type ProcurementExportCandidate = {
  platform: string;              // platform key (taobao/1688/...)
  platformLabel: string;         // 中文标签
  title: string;
  keyword: string;
  estimatedPrice: number;
  providerId: ProviderDisplayId;
  matchScore: number;            // 1..N，1 为最高
  matchReason: string;
  riskNote: string;
  sourceNote: string;            // 例："候选来源：http-mock · 第 1 匹配"
  url?: string;
};

export type ProcurementExportGroup = {
  section: string;               // "女生方案" | "男生方案" | "配饰"
  itemIndex: number;
  itemLabel: string;             // 类别 · 描述
  category: string;
  description: string;
  providerId: ProviderDisplayId;
  fallbackUsed: boolean;
  warningCode?: ProviderWarningCode;
  warning?: string;
  candidates: ProcurementExportCandidate[];
};

export type ProcurementExportBundle = {
  version: "v3.3";
  generatedAt: string;
  providerMode: "local" | "http";
  providerId: ProviderDisplayId;   // 汇总视图：如任一组 fallback，则 fallback-local
  fallbackUsed: boolean;
  warningCode?: ProviderWarningCode;
  warning?: string;
  totalCandidates: number;
  groups: ProcurementExportGroup[];
};

function toPlanItem(x: any): PlanItem {
  return {
    category: x?.category ?? x?.type ?? "",
    description: x?.description ?? x?.name ?? x?.title ?? x?.item ?? "",
    qty: x?.qty ?? x?.quantity ?? x?.count,
    unitEstimate: x?.unitEstimate ?? x?.unit_estimate ?? x?.price ?? x?.estimatedPrice,
    subtotal: x?.subtotal ?? x?.total,
    sizing: x?.sizing ?? x?.note,
  };
}

function normalizeCandidates(
  raw: Candidate[],
  providerId: ProviderDisplayId,
): ProcurementExportCandidate[] {
  return raw.slice(0, 3).map((c, idx) => ({
    platform: c.platform,
    platformLabel: PLATFORM_LABELS[c.platform] ?? String(c.platform),
    title: c.title,
    keyword: c.keyword,
    estimatedPrice: Number(c.estimatedPrice) || 0,
    providerId,
    matchScore: idx + 1,
    matchReason: c.matchReason,
    riskNote: c.riskNote,
    sourceNote: `候选来源：${providerId} · 第 ${idx + 1} 匹配`,
    url: c.url,
  }));
}

export async function resolveExportProcurement(
  plan: any,
  ctx: MatchContext,
): Promise<ProcurementExportBundle> {
  const sections: Array<{ label: string; items: any[] }> = [
    { label: "女生方案", items: Array.isArray(plan?.femalePlan) ? plan.femalePlan : (plan?.female_plan ?? plan?.female ?? []) },
    { label: "男生方案", items: Array.isArray(plan?.malePlan) ? plan.malePlan : (plan?.male_plan ?? plan?.male ?? []) },
    { label: "配饰", items: Array.isArray(plan?.accessories) ? plan.accessories : [] },
  ];

  const groups: ProcurementExportGroup[] = [];
  let providerMode: "local" | "http" = "local";
  let anyFallback = false;
  let firstWarningCode: ProviderWarningCode | undefined;
  let firstWarning: string | undefined;
  let firstNonFallbackId: ProviderDisplayId | undefined;
  let total = 0;

  for (const sec of sections) {
    if (!Array.isArray(sec.items)) continue;
    for (let i = 0; i < sec.items.length; i++) {
      const raw = sec.items[i];
      if (raw == null) continue;
      const item = toPlanItem(raw);
      if (!item.category && !item.description) continue;
      try {
        const r = await searchWithFallback(item, ctx);
        providerMode = r.providerMode;
        if (r.fallbackUsed) {
          anyFallback = true;
          if (!firstWarningCode) { firstWarningCode = r.warningCode; firstWarning = r.warning; }
        } else if (!firstNonFallbackId) {
          firstNonFallbackId = r.providerId;
        }
        const normalized = normalizeCandidates(r.candidates, r.providerId);
        total += normalized.length;
        groups.push({
          section: sec.label,
          itemIndex: i + 1,
          itemLabel: [item.category, item.description].filter(Boolean).join(" · ") || "未命名条目",
          category: String(item.category ?? ""),
          description: String(item.description ?? ""),
          providerId: r.providerId,
          fallbackUsed: r.fallbackUsed,
          warningCode: r.warningCode,
          warning: r.warning,
          candidates: normalized,
        });
      } catch {
        // 抽象层理论上不抛，兜底空组
        groups.push({
          section: sec.label,
          itemIndex: i + 1,
          itemLabel: [item.category, item.description].filter(Boolean).join(" · ") || "未命名条目",
          category: String(item.category ?? ""),
          description: String(item.description ?? ""),
          providerId: "fallback-local",
          fallbackUsed: true,
          warningCode: "LOCAL_ERROR",
          warning: "候选解析异常",
          candidates: [],
        });
        anyFallback = true;
      }
    }
  }

  const summaryProviderId: ProviderDisplayId = anyFallback
    ? "fallback-local"
    : (firstNonFallbackId ?? (providerMode === "local" ? "local" : "http"));

  return {
    version: "v3.3",
    generatedAt: new Date().toISOString(),
    providerMode,
    providerId: summaryProviderId,
    fallbackUsed: anyFallback,
    warningCode: firstWarningCode,
    warning: firstWarning,
    totalCandidates: total,
    groups,
  };
}
