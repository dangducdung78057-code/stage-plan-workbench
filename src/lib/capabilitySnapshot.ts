// Capability Snapshot · Single Source of Truth
// 治理宪章：系统成熟度只以 Capability Layer + Release Gate + 一键验收结果 为准，
// 版本号不参与判定。本模块负责从 public.system_capabilities 读取快照，供一键验收使用。
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

export type CapabilitySnapshot = {
  rows: CapabilityRow[];
  counts: {
    L0: number;
    L1: number;
    L2: number;
    PASS: number;
    WARN: number;
    FAIL: number;
    SKIP: number;
    total: number;
  };
  loadedAt: string;
  error: string | null;
};

const EMPTY_COUNTS: CapabilitySnapshot["counts"] = {
  L0: 0, L1: 0, L2: 0, PASS: 0, WARN: 0, FAIL: 0, SKIP: 0, total: 0,
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
    const rows = (data ?? []) as CapabilityRow[];
    const counts = { ...EMPTY_COUNTS, total: rows.length };
    for (const r of rows) {
      if (r.layer === "L0" || r.layer === "L1" || r.layer === "L2") counts[r.layer]++;
      if (r.status === "PASS" || r.status === "WARN" || r.status === "FAIL" || r.status === "SKIP") {
        counts[r.status]++;
      }
    }
    return { rows, counts, loadedAt, error: null };
  } catch (e: any) {
    return { rows: [], counts: { ...EMPTY_COUNTS }, loadedAt, error: e?.message ?? "unknown" };
  }
}

/**
/**
 * Release Gate Engine (治理宪章 §2)
 *
 * 从「展示层」升级为「决策层」：能力清单不再只做统计，直接参与 Gate 判定。
 * WARN 不再只是展示状态，而是参与 Gate 计算。
 *
 * 规则（自最严重向下级联，命中即返回）：
 *   R1 · FAIL 存在                       ⇒ G0 阻断
 *   R2 · L0 存在非 PASS（WARN/FAIL/SKIP-enabled） ⇒ G0 阻断（L0 = Production Stable，必须全 PASS）
 *   R3 · L1 WARN 数量 > 2                ⇒ G1 实验允许（L1 大面积 WARN，稳定性不足）
 *   R4 · L1 存在 1–2 个 WARN             ⇒ G2 可发布（可控 WARN）
 *   R5 · 仅 L2 存在 WARN                 ⇒ G1 实验允许（L2 = Experimental only）
 *   R6 · 全部 PASS                       ⇒ G3 稳定发布
 *
 * 说明：
 *   - SKIP 表示未启用，enabled=false 的 SKIP 不参与判定；enabled=true 却 SKIP 视为非 PASS。
 *   - Gate 判定不看版本号（版本号仅为标签）。
 */
export type GateLevel = "G0" | "G1" | "G2" | "G3";

export type GateResult = {
  gate: GateLevel;
  reason: string;
  rule: "R1" | "R2" | "R3" | "R4" | "R5" | "R6" | "R0";
  triggers: string[];
};

const L1_WARN_FEW_THRESHOLD = 2;

function isNonPass(row: CapabilityRow): boolean {
  if (row.status === "PASS") return false;
  if (row.status === "SKIP" && !row.enabled) return false; // 未启用的 SKIP 不参与
  return true;
}

export function computeReleaseGate(snapshot: CapabilitySnapshot): GateResult {
  const { rows, error } = snapshot;
  if (error || rows.length === 0) {
    return {
      gate: "G0",
      rule: "R0",
      reason: error ? `snapshot 读取失败: ${error}` : "snapshot 为空，缺少唯一事实源",
      triggers: [],
    };
  }

  const failMods = rows.filter((r) => r.status === "FAIL").map((r) => r.module);
  if (failMods.length > 0) {
    return {
      gate: "G0",
      rule: "R1",
      reason: `FAIL 存在（${failMods.length}）：${failMods.join(", ")}`,
      triggers: failMods,
    };
  }

  const l0Bad = rows.filter((r) => r.layer === "L0" && isNonPass(r)).map((r) => `${r.module}[${r.status}]`);
  if (l0Bad.length > 0) {
    return {
      gate: "G0",
      rule: "R2",
      reason: `L0 必须全 PASS，出现非 PASS：${l0Bad.join(", ")}`,
      triggers: l0Bad,
    };
  }

  const l1Warn = rows.filter((r) => r.layer === "L1" && r.status === "WARN").map((r) => r.module);
  if (l1Warn.length > L1_WARN_FEW_THRESHOLD) {
    return {
      gate: "G1",
      rule: "R3",
      reason: `L1 WARN 数量 ${l1Warn.length} > 阈值 ${L1_WARN_FEW_THRESHOLD}，稳定性不足：${l1Warn.join(", ")}`,
      triggers: l1Warn,
    };
  }
  if (l1Warn.length > 0) {
    return {
      gate: "G2",
      rule: "R4",
      reason: `L1 存在可控 WARN（${l1Warn.length}）：${l1Warn.join(", ")}`,
      triggers: l1Warn,
    };
  }

  const l2Warn = rows.filter((r) => r.layer === "L2" && r.status === "WARN").map((r) => r.module);
  if (l2Warn.length > 0) {
    return {
      gate: "G1",
      rule: "R5",
      reason: `L2 实验能力存在 WARN：${l2Warn.join(", ")}`,
      triggers: l2Warn,
    };
  }

  return {
    gate: "G3",
    rule: "R6",
    reason: "全部能力 PASS，稳定发布",
    triggers: [],
  };
}

export function gateTone(g: GateLevel): "success" | "warning" | "destructive" {
  if (g === "G3") return "success";
  if (g === "G2") return "warning";
  if (g === "G1") return "warning";
  return "destructive";
}

