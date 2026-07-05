// StageOS AI plan generation via Vercel AI Gateway.
// Runs the same precheck (auth -> permission -> confirmation -> validation),
// then calls the AI gateway to produce a structured plan payload matching the mock shape.
// Any AI failure is returned to the client so it can fall back to mock generation.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(payload: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
function reject(code: string, message: string, status: number, extra: Record<string, unknown> = {}) {
  return json({ ok: false, code, message, ...extra }, status);
}

type StageInputData = {
  schoolStage?: string;
  programType?: string;
  programTheme?: string;
  screenThemeColor?: string;
  performanceDate?: string;
  performerCount?: number;
  maleCount?: number;
  femaleCount?: number;
  perPersonBudget?: number;
  rehearsalFrequencyPerWeek?: number;
  students?: Array<{ studentId: string; gender: string; heightCm: number }>;
};

function validateStageInput(data: StageInputData): string[] {
  const issues: string[] = [];
  const { performerCount, maleCount, femaleCount, students } = data;
  if (typeof performerCount === "number") {
    if (typeof maleCount === "number" && typeof femaleCount === "number") {
      if (maleCount + femaleCount !== performerCount) {
        issues.push(`人数校验:男(${maleCount}) + 女(${femaleCount}) = ${maleCount + femaleCount},与总人数 ${performerCount} 不一致。`);
      }
    }
    if (students && students.length > 0 && students.length !== performerCount) {
      issues.push(`学生行数(${students.length})与总人数(${performerCount})不一致。`);
    }
  }
  return issues;
}

const PLAN_SCHEMA_HINT = `
返回 JSON 对象，结构如下（数字为整数元）：
{
  "costumePlan": {
    "femalePlan": [{"category":"上装|下装|鞋|配饰","description":"中文说明","qty":整数,"unitEstimate":整数,"subtotal":整数,"sizing":"可选中文分档"}],
    "malePlan": [同上],
    "accessories": [同上],
    "totalEstimate": 整数,
    "sizingReminders": ["中文提醒1","..."],
    "purchaseStrategy": ["中文策略1","..."],
    "planB": ["中文兜底方案1","..."]
  },
  "risks": [{"level":"low|medium|high","title":"中文标题","detail":"中文细节"}],
  "reverseSchedule": [{"daysBefore":整数,"task":"中文任务","owner":"排产负责人|采购|排产|现场|班主任"}],
  "platformSearch": [{"platform":"淘宝|1688|京东","query":"关键词","url":"https://...","note":"中文说明，必须包含‘人工核验/不代表 SKU 或库存’语义"}]
}
必须：
1. femalePlan/malePlan/accessories 至少各 3 项；
2. subtotal = qty * unitEstimate，totalEstimate = 所有 subtotal 相加；
3. reverseSchedule 至少 6 项，daysBefore 由大到小；
4. platformSearch 3 项，每条 note 明确“非真实库存价格，需人工核验”；
5. 所有文本用简体中文；不要出现任何解释性话术，只返回 JSON。
`;

async function callAiGateway(prompt: string, apiKey: string): Promise<{ ok: true; data: unknown } | { ok: false; code: string; message: string }> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 25000);
  try {
    const res = await fetch("https://ai-gateway.vercel.sh/v1/chat/completions", {
      method: "POST",
      signal: ctrl.signal,
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: "openai/gpt-4o-mini",
        messages: [
          { role: "system", content: "你是 StageOS 服装总表排产助手，只返回 JSON。" },
          { role: "user", content: prompt },
        ],
        response_format: { type: "json_object" },
      }),
    });
    if (res.status === 429) return { ok: false, code: "AI_RATE_LIMIT", message: "AI 网关限流，请稍后重试。" };
    if (res.status === 402) return { ok: false, code: "AI_CREDITS_EXHAUSTED", message: "AI 网关额度已耗尽。" };
    if (!res.ok) {
      const t = await res.text().catch(() => "");
      return { ok: false, code: "AI_UPSTREAM_ERROR", message: `AI 上游错误 ${res.status}: ${t.slice(0, 200)}` };
    }
    const body = await res.json();
    const content = body?.choices?.[0]?.message?.content;
    if (!content || typeof content !== "string") {
      return { ok: false, code: "AI_EMPTY_RESPONSE", message: "AI 返回为空。" };
    }
    let parsed: unknown;
    try { parsed = JSON.parse(content); } catch {
      return { ok: false, code: "AI_INVALID_JSON", message: "AI 返回非合法 JSON。" };
    }
    return { ok: true, data: parsed };
  } catch (e) {
    const msg = (e as Error).message ?? "";
    if ((e as any)?.name === "AbortError" || /abort/i.test(msg)) {
      return { ok: false, code: "AI_TIMEOUT", message: "AI 网关调用超时。" };
    }
    return { ok: false, code: "AI_NETWORK_ERROR", message: msg || "AI 网络错误。" };
  } finally {
    clearTimeout(timer);
  }
}

function validatePlanShape(plan: any): { ok: true } | { ok: false; missing: string[] } {
  const missing: string[] = [];
  if (!plan || typeof plan !== "object") return { ok: false, missing: ["plan"] };
  const cp = plan.costumePlan;
  if (!cp || typeof cp !== "object") missing.push("costumePlan");
  else {
    if (!Array.isArray(cp.femalePlan) || cp.femalePlan.length === 0) missing.push("femalePlan");
    if (!Array.isArray(cp.malePlan) || cp.malePlan.length === 0) missing.push("malePlan");
    if (!Array.isArray(cp.accessories) || cp.accessories.length === 0) missing.push("accessories");
    if (typeof cp.totalEstimate !== "number") missing.push("totalEstimate");
  }
  if (!Array.isArray(plan.risks) || plan.risks.length === 0) missing.push("risks");
  if (!Array.isArray(plan.reverseSchedule) || plan.reverseSchedule.length === 0) missing.push("reverseSchedule");
  if (!Array.isArray(plan.platformSearch) || plan.platformSearch.length === 0) missing.push("platformSearch");
  return missing.length === 0 ? { ok: true } : { ok: false, missing };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const body = await req.json().catch(() => ({}));

    // Healthcheck short-circuit — must return before any uuid parse / db / auth work.
    if (body?.healthcheck === true) {
      return json({ ok: true, code: "AI_HEALTHCHECK_OK", mode: "healthcheck" });
    }

    const projectId: string | undefined = body?.projectId;
    const UUID_RE = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;
    if (!projectId) return reject("BAD_REQUEST", "projectId 必填。", 400);
    if (typeof projectId !== "string" || !UUID_RE.test(projectId)) {
      return reject("BAD_REQUEST", "project_id must be uuid", 400);
    }

    const authHeader = req.headers.get("Authorization") ?? "";
    if (!authHeader.startsWith("Bearer ")) return reject("UNAUTHORIZED", "请先登录后再生成排产。", 401);
    const jwt = authHeader.slice("Bearer ".length);

    const anon = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!);
    const { data: userData, error: uErr } = await anon.auth.getUser(jwt);
    if (uErr || !userData?.user) return reject("UNAUTHORIZED", "登录已失效，请重新登录。", 401);
    const uid = userData.user.id;

    const svc = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

    const { data: project, error: pErr } = await svc.from("projects").select("id, user_id, title, performance_date").eq("id", projectId).maybeSingle();
    if (pErr) throw pErr;
    if (!project || project.user_id !== uid) return reject("FORBIDDEN", "无权访问该项目。", 403);

    const { data: confirmed, error: cErr } = await svc
      .from("confirmation_records").select("id").eq("project_id", projectId).eq("status", "confirmed")
      .order("confirmed_at", { ascending: false }).limit(1);
    if (cErr) throw cErr;
    if (!confirmed || confirmed.length === 0) {
      return reject("CONFIRMATION_REQUIRED", "请先完成用户确认/隐私确认后再生成排产。", 403);
    }

    const { data: si, error: siErr } = await svc.from("stage_inputs").select("data").eq("project_id", projectId).maybeSingle();
    if (siErr) throw siErr;
    const input = (si?.data ?? {}) as StageInputData;
    const issues = validateStageInput(input);
    if (issues.length > 0) return reject("VALIDATION_REQUIRED", "请先解决数据校验提示，再生成排产。", 422, { issues });

    // 优先读函数密钥；未配置时回退到 RLS 全拒绝的 app_secrets 表（仅 service role 可读）
    let apiKey = Deno.env.get("AI_GATEWAY_API_KEY") ?? Deno.env.get("LOVABLE_API_KEY") ?? "";
    if (!apiKey) {
      const { data: secret } = await svc
        .from("app_secrets").select("value").eq("name", "AI_GATEWAY_API_KEY").maybeSingle();
      apiKey = secret?.value ?? "";
    }
    if (!apiKey) return reject("AI_NOT_CONFIGURED", "AI 网关未配置。", 503);

    const prompt = `请为以下学校演出项目生成服装总表方案。\n项目标题: ${project.title}\n演出日期: ${project.performance_date ?? "未定"}\nStageInput: ${JSON.stringify(input)}\n\n${PLAN_SCHEMA_HINT}`;

    const ai = await callAiGateway(prompt, apiKey);
    if (!ai.ok) return json({ ok: false, code: ai.code, message: ai.message, aiFailed: true }, 502);
    const shape = validatePlanShape(ai.data);
    if (!shape.ok) return json({ ok: false, code: "AI_SHAPE_INVALID", message: `AI 输出结构不合规，缺少: ${shape.missing.join(", ")}`, missing: shape.missing, aiFailed: true }, 502);

    return json({ ok: true, mode: "ai", plan: ai.data });
  } catch (e) {
    return json({ ok: false, code: "INTERNAL", message: (e as Error).message ?? "internal error" }, 500);
  }
});
