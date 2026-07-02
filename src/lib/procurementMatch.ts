// StageOS · 采购候选商品匹配器 v1
// 输入服装项 + 上下文，返回 <=3 个候选商品。永不抛错。

import { PROCUREMENT_CATALOG, type Candidate, type CatalogEntry } from "./procurementCatalog";

export type PlanItem = {
  category?: string;
  description?: string;
  qty?: number;
  unitEstimate?: number;
  subtotal?: number;
  sizing?: string;
};

export type MatchContext = {
  programType?: string;
  schoolStage?: string;
};

function textOf(item: PlanItem): string {
  return `${item.category ?? ""} ${item.description ?? ""} ${item.sizing ?? ""}`.trim();
}

function scoreEntry(entry: CatalogEntry, text: string, ctx: MatchContext): number {
  let score = 0;
  for (const tag of entry.categoryTags) {
    if (text.includes(tag)) score += 10;
  }
  if (score === 0) return 0;
  if (entry.programTypes && ctx.programType && entry.programTypes.includes(ctx.programType)) {
    score += 4;
  }
  if (entry.schoolStages && ctx.schoolStage && entry.schoolStages.includes(ctx.schoolStage)) {
    score += 2;
  }
  return score;
}

function fallback(item: PlanItem): Candidate[] {
  const kw = [item.category, item.description].filter(Boolean).join(" ") || "学生 演出服";
  return [{
    platform: "taobao",
    title: `通用检索：${kw}`,
    keyword: kw,
    estimatedPrice: Number(item.unitEstimate) || 0,
    matchReason: "未命中本地目录，建议按项目描述人工搜索",
    riskNote: "无预置候选，需人工核验商品与库存",
    url: `https://s.taobao.com/search?q=${encodeURIComponent(kw)}`,
  }];
}

export function matchCandidates(item: PlanItem, ctx: MatchContext = {}): Candidate[] {
  try {
    const text = textOf(item);
    if (!text) return fallback(item);
    const ranked = PROCUREMENT_CATALOG
      .map((e) => ({ e, s: scoreEntry(e, text, ctx) }))
      .filter((r) => r.s > 0)
      .sort((a, b) => b.s - a.s);
    if (!ranked.length) return fallback(item);
    const out: Candidate[] = [];
    for (const { e } of ranked) {
      for (const c of e.candidates) {
        if (out.length >= 3) break;
        out.push(c);
      }
      if (out.length >= 3) break;
    }
    return out.length ? out : fallback(item);
  } catch {
    return fallback(item);
  }
}
