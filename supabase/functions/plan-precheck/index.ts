// StageOS plan generation precheck.
// Enforces order: auth -> permission -> confirmation -> validation.
// Error codes:
//   AUTH_REQUIRED (401)
//   FORBIDDEN (403)
//   PRIVACY_CONFIRMATION_REQUIRED (403)
//   VALIDATION_REQUIRED (422)
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

function fail(code: string, message: string, status: number, extra: Record<string, unknown> = {}) {
  return new Response(JSON.stringify({ ok: false, code, message, ...extra }), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const body = await req.json().catch(() => ({}));
    const projectId: string | undefined = body?.projectId;
    if (!projectId) {
      return fail("BAD_REQUEST", "projectId 必填。", 400);
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // 1) Auth check. V1 has no authentication; stub as "system" principal.
    //    Kept explicit so the order matches the spec once auth ships.
    const principal = { id: "system", authenticated: true };
    if (!principal.authenticated) {
      return fail("AUTH_REQUIRED", "请先登录后再生成排产。", 401);
    }

    // 2) Permission check (V1: single-tenant, always allowed).
    const { data: project, error: pErr } = await supabase
      .from("projects").select("id, title").eq("id", projectId).maybeSingle();
    if (pErr) throw pErr;
    if (!project) return fail("FORBIDDEN", "无权访问该项目。", 403);

    // 3) Privacy / user confirmation gate.
    const { data: confirmed } = await supabase
      .from("confirmation_records")
      .select("id, status, confirmed_at")
      .eq("project_id", projectId)
      .eq("status", "confirmed")
      .order("confirmed_at", { ascending: false })
      .limit(1);
    if (!confirmed || confirmed.length === 0) {
      return fail(
        "PRIVACY_CONFIRMATION_REQUIRED",
        "请先完成用户确认/隐私确认后再生成排产。",
        403,
      );
    }

    // 4) Data validation (only reached after confirmation).
    const { data: si } = await supabase
      .from("stage_inputs").select("data").eq("project_id", projectId).maybeSingle();
    const issues = validateStageInput((si?.data ?? {}) as StageInputData);
    if (issues.length > 0) {
      return fail("VALIDATION_REQUIRED", "请先解决数据校验提示,再生成排产。", 422, { issues });
    }

    return new Response(JSON.stringify({ ok: true }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    return fail("INTERNAL", (e as Error).message ?? "internal error", 500);
  }
});
