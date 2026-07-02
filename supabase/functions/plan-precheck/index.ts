// StageOS plan generation precheck.
// Enforces order: auth -> permission -> confirmation -> validation.
// Business rejections return status 200 with { ok:false, errorCode, message }
// so the Supabase JS client does not throw for expected gating outcomes.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";

type StageInputData = {
  performerCount?: number;
  maleCount?: number;
  femaleCount?: number;
  students?: Array<{ studentId: string; gender: string; heightCm: number }>;
};

function validateStageInput(data: StageInputData): string[] {
  const issues: string[] = [];
  const { performerCount, maleCount, femaleCount, students } = data;
  if (typeof performerCount === "number") {
    if (typeof maleCount === "number" && typeof femaleCount === "number") {
      if (maleCount + femaleCount !== performerCount) {
        issues.push(
          `人数校验:男(${maleCount}) + 女(${femaleCount}) = ${maleCount + femaleCount},与总人数 ${performerCount} 不一致。`,
        );
      }
    }
    if (students && students.length > 0 && students.length !== performerCount) {
      issues.push(`学生行数(${students.length})与总人数(${performerCount})不一致。`);
    }
  }
  return issues;
}

function reject(errorCode: string, message: string, intendedStatus: number, extra: Record<string, unknown> = {}) {
  return new Response(
    JSON.stringify({ ok: false, errorCode, message, intendedStatus, ...extra }),
    { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
  );
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const body = await req.json().catch(() => ({}));
    const projectId: string | undefined = body?.projectId;
    if (!projectId) {
      return reject("BAD_REQUEST", "projectId 必填。", 400);
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // 1) Auth check. V1 has no authentication; stub as system principal.
    const principal = { id: "system", authenticated: true };
    if (!principal.authenticated) {
      return reject("UNAUTHORIZED", "请先登录后再生成排产。", 401);
    }

    // 2) Permission check (V1: single-tenant, always allowed if project exists).
    const { data: project, error: pErr } = await supabase
      .from("projects").select("id, title").eq("id", projectId).maybeSingle();
    if (pErr) throw pErr;
    if (!project) return reject("FORBIDDEN", "无权访问该项目。", 403);

    // 3) Privacy / user confirmation gate.
    const { data: confirmed } = await supabase
      .from("confirmation_records")
      .select("id, status, confirmed_at")
      .eq("project_id", projectId)
      .eq("status", "confirmed")
      .order("confirmed_at", { ascending: false })
      .limit(1);
    if (!confirmed || confirmed.length === 0) {
      return reject(
        "CONFIRMATION_REQUIRED",
        "请先完成用户确认/隐私确认后再生成排产。",
        403,
      );
    }

    // 4) Data validation (only after confirmation passes).
    const { data: si } = await supabase
      .from("stage_inputs").select("data").eq("project_id", projectId).maybeSingle();
    const issues = validateStageInput((si?.data ?? {}) as StageInputData);
    if (issues.length > 0) {
      return reject(
        "VALIDATION_REQUIRED",
        "请先解决数据校验提示,再生成排产。",
        422,
        { issues },
      );
    }

    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    // System errors keep a non-2xx status so client can treat them differently.
    return new Response(
      JSON.stringify({ ok: false, errorCode: "INTERNAL", message: (e as Error).message ?? "internal error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
