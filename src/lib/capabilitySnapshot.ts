// Capability Snapshot · Single Source of Truth
// 治理宪章：系统成熟度只以 Capability Layer + Release Gate + 一键验收结果 为准，
// 版本号不参与判定。本模块负责从 public.system_capabilities 读取快照，供一键验收使用。
//
// 收口优化（不改变 Gate 判定规则，仅优化计数/输出以杜绝误判）：
//   1) WARN 按 module 唯一去重（表已 PK on module，此处再显式声明）。
//   2) 系统级 WARN 与 Gate 触发 WARN 拆开呈现。
//   3) L2 WARN 标记为 "isolated experimental warning"。
//   4) counts 按 L0/L1/L2 拆分独立 WARN / FAIL / SKIP-active 计数。
import { supabase } from "@/integrations/supabase/client";

export type CapabilityLayer = "L0" | "L1" | "L2";
export type CapabilityStatus = "PASS" | "WARN" | "FAIL" | "SKIP";

export type CapabilityRow = {
  module: string;
  layer: CapabilityLayer;
  status: CapabilityStatus;
  enabled: boolean;
  notes: string | null;
  updated_at: string;
};

export type CapabilityCounts = {
  // 层聚合（各模块所属层，一 module 只算一次）
  L0: number;
  L1: number;
  L2: number;
  // 状态聚合（全局）
  PASS: number;
  WARN: number; // = warnUnique（每 module 至多计 1）
  FAIL: number;
  SKIP: number;
  total: number;
  // 拆分：每层独立 WARN / FAIL 计数（治理宪章需要按层判读）
  L0_WARN: number;
  L1_WARN: number;
  L2_WARN: number;
  L0_FAIL: number;
  L1_FAIL: number;
  L2_FAIL: number;
  // 明示：唯一 WARN 模块数（== WARN），用于 UI 消除歧义
  warnUnique: number;
};

export type CapabilitySnapshot = {
  rows: CapabilityRow[];
  counts: CapabilityCounts;
  loadedAt: string;
  error: string | null;
};

const EMPTY_COUNTS: CapabilityCounts = {
  L0: 0, L1: 0, L2: 0,
  PASS: 0, WARN: 0, FAIL: 0, SKIP: 0, total: 0,
  L0_WARN: 0, L1_WARN: 0, L2_WARN: 0,
  L0_FAIL: 0, L1_FAIL: 0, L2_FAIL: 0,
  warnUnique: 0,
};

export async function loadCapabilitySnapshot(): Promise<CapabilitySnapshot> {
  const loadedAt = new Date().toISOString();
  try {
    const { data, error } = await supabase
      .from("system_capabilities")
      .select("module,layer,status,enabled,notes,updated_at")
      .order("layer", { ascending: true })
      .order("module", { ascending: true });
    if (error) {
      return { rows: [], counts: { ...EMPTY_COUNTS }, loadedAt, error: error.message };
    }
    // module 去重（表已 PK on module，此处再兜一层，杜绝快照重复计数）
    const seen = new Set<string>();
    const rows: CapabilityRow[] = [];
    for (const r of (data ?? []) as CapabilityRow[]) {
      if (seen.has(r.module)) continue;
      seen.add(r.module);
      rows.push(r);
    }
    const counts: CapabilityCounts = { ...EMPTY_COUNTS, total: rows.length };
    for (const r of rows) {
      if (r.layer === "L0" || r.layer === "L1" || r.layer === "L2") counts[r.layer]++;
      if (r.status === "PASS" || r.status === "WARN" || r.status === "FAIL" || r.status === "SKIP") {
        counts[r.status]++;
      }
      if (r.status === "WARN") {
        if (r.layer === "L0") counts.L0_WARN++;
        else if (r.layer === "L1") counts.L1_WARN++;
        else if (r.layer === "L2") counts.L2_WARN++;
      } else if (r.status === "FAIL") {
        if (r.layer === "L0") counts.L0_FAIL++;
        else if (r.layer === "L1") counts.L1_FAIL++;
        else if (r.layer === "L2") counts.L2_FAIL++;
      }
    }
    counts.warnUnique = counts.WARN; // module PK 保证唯一，两值恒等
    return { rows, counts, loadedAt, error: null };
  } catch (e: any) {
    return { rows: [], counts: { ...EMPTY_COUNTS }, loadedAt, error: e?.message ?? "unknown" };
  }
}

/**
 * Release Gate Engine (治理宪章 §2)
 *
 * 判定规则不变（自最严重向下级联，命中即返回）：
 *   R1 · FAIL 存在                       ⇒ G0 阻断
 *   R2 · L0 存在非 PASS                  ⇒ G0 阻断
 *   R3 · L1 WARN 数量 > 2                ⇒ G1 实验允许
 *   R4 · L1 存在 1–2 个 WARN             ⇒ G2 可发布（可控 WARN）
 *   R5 · 仅 L2 存在 WARN                 ⇒ G1 实验允许（isolated experimental）
 *   R6 · 全部 PASS                       ⇒ G3 稳定发布
 *
 * 收口优化：GateResult 现在明确区分
 *   - triggers                     命中当前规则的模块（原语义）
 *   - systemWarnModules            系统级所有 WARN 模块（信息用途，不代表 Gate 结果）
 *   - gateTriggeringWarnModules    真正影响本次 Gate 决策的 WARN 模块
 *   - isolatedExperimentalWarnings 仅 L2 WARN，标签固定 "isolated experimental warning"
 *   - warnCountByLayer             { L0, L1, L2 } 每层独立 WARN 计数
 */
export type GateLevel = "G0" | "G1" | "G2" | "G3";

export type IsolatedExperimentalWarning = {
  module: string;
  layer: "L2";
  status: "WARN";
  tag: "isolated experimental warning";
};

export type GateResult = {
  gate: GateLevel;
  reason: string;
  rule: "R1" | "R2" | "R3" | "R4" | "R5" | "R6" | "R0";
  triggers: string[];
  systemWarnModules: string[];
  gateTriggeringWarnModules: string[];
  isolatedExperimentalWarnings: IsolatedExperimentalWarning[];
  warnCountByLayer: { L0: number; L1: number; L2: number };
};

const L1_WARN_FEW_THRESHOLD = 2;

function isNonPass(row: CapabilityRow): boolean {
  if (row.status === "PASS") return false;
  if (row.status === "SKIP" && !row.enabled) return false;
  return true;
}

export function computeReleaseGate(snapshot: CapabilitySnapshot): GateResult {
  const { rows, counts, error } = snapshot;

  // 系统级 WARN（去重 · 按 module）
  const systemWarnRows = rows.filter((r) => r.status === "WARN");
  const systemWarnModules = Array.from(new Set(systemWarnRows.map((r) => r.module)));
  const l0WarnMods = systemWarnRows.filter((r) => r.layer === "L0").map((r) => r.module);
  const l1WarnMods = systemWarnRows.filter((r) => r.layer === "L1").map((r) => r.module);
  const l2WarnMods = systemWarnRows.filter((r) => r.layer === "L2").map((r) => r.module);
  const isolatedExperimentalWarnings: IsolatedExperimentalWarning[] = l2WarnMods.map((m) => ({
    module: m,
    layer: "L2",
    status: "WARN",
    tag: "isolated experimental warning",
  }));
  const warnCountByLayer = {
    L0: l0WarnMods.length,
    L1: l1WarnMods.length,
    L2: l2WarnMods.length,
  };

  const base = {
    systemWarnModules,
    isolatedExperimentalWarnings,
    warnCountByLayer,
  };

  if (error || rows.length === 0) {
    return {
      gate: "G0",
      rule: "R0",
      reason: error ? `snapshot 读取失败: ${error}` : "snapshot 为空，缺少唯一事实源",
      triggers: [],
      gateTriggeringWarnModules: [],
      ...base,
    };
  }

  const failMods = rows.filter((r) => r.status === "FAIL").map((r) => r.module);
  if (failMods.length > 0) {
    return {
      gate: "G0",
      rule: "R1",
      reason: `FAIL 存在（${failMods.length}）：${failMods.join(", ")}`,
      triggers: failMods,
      gateTriggeringWarnModules: [], // FAIL 决策，WARN 未参与
      ...base,
    };
  }

  const l0Bad = rows.filter((r) => r.layer === "L0" && isNonPass(r));
  if (l0Bad.length > 0) {
    return {
      gate: "G0",
      rule: "R2",
      reason: `L0 必须全 PASS，出现非 PASS：${l0Bad.map((r) => `${r.module}[${r.status}]`).join(", ")}`,
      triggers: l0Bad.map((r) => `${r.module}[${r.status}]`),
      gateTriggeringWarnModules: l0Bad.filter((r) => r.status === "WARN").map((r) => r.module),
      ...base,
    };
  }

  if (l1WarnMods.length > L1_WARN_FEW_THRESHOLD) {
    return {
      gate: "G1",
      rule: "R3",
      reason: `L1 WARN 数量 ${l1WarnMods.length} > 阈值 ${L1_WARN_FEW_THRESHOLD}，稳定性不足：${l1WarnMods.join(", ")}`,
      triggers: l1WarnMods,
      gateTriggeringWarnModules: l1WarnMods,
      ...base,
    };
  }
  if (l1WarnMods.length > 0) {
    return {
      gate: "G2",
      rule: "R4",
      reason: `L1 存在可控 WARN（${l1WarnMods.length}）：${l1WarnMods.join(", ")}`,
      triggers: l1WarnMods,
      gateTriggeringWarnModules: l1WarnMods,
      ...base,
    };
  }

  if (l2WarnMods.length > 0) {
    // R5：仅 L2 WARN — 归类为 isolated experimental warning
    return {
      gate: "G1",
      rule: "R5",
      reason: `L2 实验能力存在 WARN（isolated experimental warning）：${l2WarnMods.join(", ")}`,
      triggers: l2WarnMods,
      gateTriggeringWarnModules: l2WarnMods,
      ...base,
    };
  }

  // 一致性 sanity（不影响判定，仅保证输出稳定）
  void counts;

  return {
    gate: "G3",
    rule: "R6",
    reason: "全部能力 PASS，稳定发布",
    triggers: [],
    gateTriggeringWarnModules: [],
    ...base,
  };
}

export function gateTone(g: GateLevel): "success" | "warning" | "destructive" {
  if (g === "G3") return "success";
  if (g === "G2") return "warning";
  if (g === "G1") return "warning";
  return "destructive";
}
