// Release Freeze System
// 治理宪章：一键验收完成后，基于 Gate + Capability Snapshot 自动执行"发布冻结"判定，
// 结果写入 public.release_freezes 表（不依赖版本号，仅记录 baseline 作为标签）。
//
// 冻结规则：
//   G3 → frozen           （稳定发布，锁定候选集）
//   G2 → candidate_frozen （可发布 / 候选冻结）
//   G1 → rejected
//   G0 → rejected
import { supabase } from "@/integrations/supabase/client";
import type { CapabilitySnapshot, GateResult, GateLevel } from "./capabilitySnapshot";

export type FreezeStatus = "frozen" | "candidate_frozen" | "rejected";

export type FreezeDecision = {
  gate: GateLevel;
  status: FreezeStatus;
  rule: GateResult["rule"];
  reason: string;
};

export type FreezePersisted = FreezeDecision & {
  id: string | null;
  baseline: string;
  createdAt: string;
  persisted: boolean;
  error: string | null;
};

export function decideFreeze(gate: GateResult): FreezeDecision {
  const status: FreezeStatus =
    gate.gate === "G3" ? "frozen" :
    gate.gate === "G2" ? "candidate_frozen" :
    "rejected";
  let reason = gate.reason;
  if (gate.rule === "R5" && gate.isolatedExperimentalWarnings.length > 0) {
    reason = `L2 isolated experimental warning: ${gate.isolatedExperimentalWarnings.map((w) => w.module).join(", ")}`;
  }
  return { gate: gate.gate, status, rule: gate.rule, reason };
}

export function freezeTone(s: FreezeStatus): "success" | "warning" | "destructive" {
  if (s === "frozen") return "success";
  if (s === "candidate_frozen") return "warning";
  return "destructive";
}

export async function persistFreeze(params: {
  baseline: string;
  snapshot: CapabilitySnapshot;
  gate: GateResult;
  userId: string | null;
}): Promise<FreezePersisted> {
  const decision = decideFreeze(params.gate);
  const createdAt = new Date().toISOString();
  const base: FreezePersisted = {
    ...decision,
    id: null,
    baseline: params.baseline,
    createdAt,
    persisted: false,
    error: null,
  };
  if (!params.userId) {
    return { ...base, error: "no session (freeze not persisted)" };
  }
  try {
    const { data, error } = await supabase
      .from("release_freezes")
      .insert({
        gate: decision.gate,
        baseline: params.baseline,
        capability_snapshot: {
          rows: params.snapshot.rows,
          counts: params.snapshot.counts,
          loadedAt: params.snapshot.loadedAt,
          gate: {
            gate: params.gate.gate,
            rule: params.gate.rule,
            reason: params.gate.reason,
            triggers: params.gate.triggers,
            warnCountByLayer: params.gate.warnCountByLayer,
            systemWarnModules: params.gate.systemWarnModules,
            gateTriggeringWarnModules: params.gate.gateTriggeringWarnModules,
            isolatedExperimentalWarnings: params.gate.isolatedExperimentalWarnings,
          },
        },
        status: decision.status,
        rule: decision.rule,
        reason: decision.reason,
        created_by: params.userId,
      } as any)
      .select("id,created_at")
      .single();
    if (error) return { ...base, error: error.message };
    return {
      ...base,
      id: (data as any)?.id ?? null,
      createdAt: (data as any)?.created_at ?? createdAt,
      persisted: true,
    };
  } catch (e: any) {
    return { ...base, error: e?.message ?? "unknown" };
  }
}
