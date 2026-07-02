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
 * Release Gate 判定（治理宪章 §2）：
 * - FAIL 存在 ⇒ G0 阻断
 * - L2 存在 WARN 或 FAIL ⇒ 至多 G1（实验允许）
 * - L1 存在 WARN ⇒ 至多 G2（可发布，可控 WARN）
 * - 全部 PASS ⇒ G3 稳定发布
 */
export function computeReleaseGate(snapshot: CapabilitySnapshot): {
  gate: "G0" | "G1" | "G2" | "G3";
  reason: string;
} {
  const { rows, counts, error } = snapshot;
  if (error || rows.length === 0) {
    return { gate: "G0", reason: error ? `snapshot 读取失败: ${error}` : "snapshot 为空" };
  }
  if (counts.FAIL > 0) return { gate: "G0", reason: `FAIL=${counts.FAIL} 阻断 Gate` };
  const l2Bad = rows.some((r) => r.layer === "L2" && (r.status === "WARN" || r.status === "FAIL"));
  if (l2Bad) return { gate: "G1", reason: "L2 实验能力存在 WARN/FAIL，仅允许实验发布" };
  const l1Warn = rows.some((r) => r.layer === "L1" && r.status === "WARN");
  if (l1Warn) return { gate: "G2", reason: "L1 存在可控 WARN，可发布但需关注" };
  return { gate: "G3", reason: "全部能力 PASS，稳定发布" };
}
