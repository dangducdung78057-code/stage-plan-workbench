// StageOS plan generation precheck.
// Enforces order: auth -> permission -> confirmation -> validation.
// Business rejections return stable JSON with an HTTP business status.
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

function jsonResponse(payload: Record<string, unknown>, status = 200) {
  return new Response(
    JSON.stringify(payload),
    { status, headers: { ...corsHeaders, "Content-Type": "application/json" } },
  );
}

function reject(code: string, message: string, status: number, extra: Record<string, unknown> = {}) {
  return jsonResponse({ ok: false, code, message, ...extra }, status);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const body = await req.json().catch(() => ({}));
    const projectId: string | undefined = body?.projectId;
    if (!projectId) {
      return reject("BAD_REQUEST", "projectId 必填。", 400);
    }

    // 1) Auth check: require Bearer JWT and validate the caller.
    const authHeader = req.headers.get("Authorization") ?? "";
    if (!authHeader.startsWith("Bearer ")) {
      return reject("UNAUTHORIZED", "请先登录后再生成排产。", 401);
    }
    const jwt = authHeader.slice("Bearer ".length);

    const anon = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
    );
    const { data: userData, error: uErr } = await anon.auth.getUser(jwt);
    if (uErr || !userData?.user) {
      return reject("UNAUTHORIZED", "登录已失效，请重新登录。", 401);
    }
    const uid = userData.user.id;

    // Service-role client to read data while enforcing ownership manually.
    const svc = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // 2) Permission check: project must exist and belong to the caller.
    const { data: project, error: pErr } = await svc
      .from("projects").select("id, user_id").eq("id", projectId).maybeSingle();
    if (pErr) throw pErr;
    if (!project || project.user_id !== uid) {
      return reject("FORBIDDEN", "无权访问该项目。", 403);
    }

    // 3) Privacy / user confirmation gate.
    const { data: confirmed, error: cErr } = await svc
      .from("confirmation_records")
      .select("id, status, confirmed_at")
      .eq("project_id", projectId)
      .eq("status", "confirmed")
      .order("confirmed_at", { ascending: false })
      .limit(1);
    if (cErr) throw cErr;
    if (!confirmed || confirmed.length === 0) {
      return reject(
        "CONFIRMATION_REQUIRED",
        "请先完成用户确认/隐私确认后再生成排产。",
        403,
      );
    }

    // 4) Data validation (only after confirmation passes).
    const { data: si, error: siErr } = await svc
      .from("stage_inputs").select("data").eq("project_id", projectId).maybeSingle();
    if (siErr) throw siErr;
    const issues = validateStageInput((si?.data ?? {}) as StageInputData);
    if (issues.length > 0) {
      return reject(
        "VALIDATION_REQUIRED",
        "请先解决数据校验提示，再生成排产。",
        422,
        { issues },
      );
    }

    return jsonResponse({ ok: true });
  } catch (e) {
    return jsonResponse(
      { ok: false, code: "INTERNAL", message: (e as Error).message ?? "internal error" },
      500,
    );
  }
});
