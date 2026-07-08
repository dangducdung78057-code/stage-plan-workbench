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

// 领域知识库：来自 StageOS 核心引擎分析报告（学段画像/价格基准/Plan B 规则/合唱队形规律）。
const DOMAIN_KNOWLEDGE = `
【学段画像矩阵】按学段严格套用以下约束：
| 维度 | 小学低段(1-3) | 小学高段(4-6) | 初中 | 高中 |
| 人均预算(元) | 40-100 | 60-150 | 100-250 | 200-600 |
| 色彩饱和度 | 高(亮红/亮黄) | 中 | 中 | 中低(避免过艳) |
| 款式复杂度 | 简单 | 中等 | 中偏高 | 高(可定制) |
| 男女款区分 | 低(可同款) | 中 | 高 | 高 |
| 现货:定制比例 | 7:3 | 5:5 | 3:7 | 2:8 |
| 最小采购提前期 | 7天 | 14天 | 21天 | 30天 |
| 尺码策略 | 统一大一码 | 标准码+演出前7天复测 | 标准码+身高分布统计 | 专业量体+定制 |
| 面料偏好 | 纯棉/涤棉/针织/摇粒绒 | 纯棉/涤棉 | 混纺 | 羊毛混纺/高支棉/西服面料/丝绒 |
小学低段避免黑色/深灰；高中避免过度卡通元素。

【价格基准表】单价估算以 1688 批发档为基准（淘宝≈1.33倍，京东≈1.20倍）：
上装：T恤定制25 / POLO定制印字45 / 卫衣定制55 / 衬衫60
下装：五分裤50 / 百褶裙55 / 长裤55 / 西裤70
鞋：舞蹈鞋45 / 跑步鞋60 / 板鞋70 / 皮鞋80
配饰：中筒袜3 / 国旗贴2 / 头花4 / 手摇旗5 / 徽章5 / 加油棒6 / 彩带8 / 发光棒8 / 护腕15
unitEstimate 应贴近上述基准（可按主题/定制程度上下浮动 30% 以内）。

【预算校验】若 StageInput 含人均预算：totalEstimate 与 (人均预算×总人数) 的偏差应控制在 ±10% 内；若超出，必须在 risks 中给出 medium 以上风险说明。

【Plan B 规则】planB 至少覆盖三类兜底：
1. 物流延迟 → 同款现货替代（约为基准价 0.7 倍，淘宝现货）；
2. 颜色偏差 → 同款备选色（优先深色系，价格不变）；
3. 数量不足 → 关键单品单件补购（约为基准价 1.33 倍，淘宝零售）。

【节目类型规律】合唱/朗诵类：队形以整体方阵为主（2-3 个队形），服装强调整体统一与色块层次，风格优先 西方古典/融合/国风；舞蹈类：男女款区分更高，需考虑动作幅度（弹性面料、舞蹈鞋）。

【倒排计划锚点】reverseSchedule 必须尊重该学段最小采购提前期：定制类下单节点不得晚于演出前的最小提前期；并包含 尺码复测(约 D-7)、到货验收、彩排试穿、演出日检查 节点。

【服装款式库·合唱】按 学段×主题 匹配（来自 31 个真实演出视频归纳）：
- 小学低段×童趣：女=圆领T恤/小飞袖纱质上衣+背带短裤/蓬蓬纱裙(棉质/薄纱,A字)；男=深色西装外套+白衬衫+领结+深色长裤
- 小学低段×古诗/国风：女=中式立领上衣(浅蓝底白镶边/盘扣)+浅色长裤或连衣裙(棉麻/轻纱)；男=深色中式立领或深灰西装
- 小学中段×古诗：女=橄榄绿丝绒连衣裙(荷叶领,收腰A字)；男=白衬衫+深色马甲+领结+黑长裤
- 小学中段×民谣：女=蓝白碎花连衣裙(江南风)；男=白衬衫+深色长裤
- 初中×仪式/主旋律：女=统一白色礼服裙(H型直身,简洁无装饰)；男=白衬衫或深色西装+深色长裤
- 高中×古诗：女=渐变长裙+盘扣(中式立领,收腰大摆,垂坠缎面)；男=同色系渐变中式立领衬衫或灰西装
- 高中×民谣：女=收腰上衣+撞色分层百褶长裙(可双色声部分组)；男=灰西装+深色长裤
- 高中×民族：女=撞色长款演出服+民族纹样+银饰头饰(如玫粉+藏蓝)；男=同色系民族上衣
- 高中×国际：女=学院风西装外套+衬衫+蝴蝶结+百褶短裙；男=西装或立领套装
描述 description 时应体现领型/面料/廓形，向上述款式靠拢。

【色彩规律】女款主色按 学段×主题：小学低段童趣=明黄/浅粉、古诗=浅粉/天蓝；小学中段古诗=橄榄绿、民谣=天蓝+白；初中仪式=纯白；高中古诗=粉蓝渐变、民谣=粉+蓝绿、民族=玫粉+藏蓝。男款一律冷色/深色（藏青/深灰/黑）。指挥服装独立成色形成视觉焦点。高中及以上合唱建议双色分组实现声部可视化。

【硬性禁忌】违反以下任一条即为不合格方案：
1. 未成年学生禁止露背/露肩/深V/高叉/超短裙/透视面料，一律保守领型；
2. 学前与小学低段禁止纯黑/深灰/暗紫主色（体型小会被舞台吃掉），改用高明度亮色；
3. 服装颜色与舞台背景同色系禁止（表演者会"消失"），确保至少 2 级明度差；
4. 古诗/国风主题禁用荧光色与高饱和撞色，用低饱和传统色（水墨灰/青绿/藕粉/月白）；
5. 童趣主题禁止暗黑配色；仪式主题禁止荧光彩虹色，用红金或白+深色系；
6. 低龄(小学低段及以下)禁用厚重呢绒/皮草/多层厚重礼服，用棉质/薄纱透气面料；
7. 传统戏曲主题禁配 LED/发光棒等现代电子道具，配水袖/折扇/团扇；
8. 面料与季节匹配：夏季忌厚重丝绒，冬季忌轻薄薄纱（按演出日期判断季节）。

【道具建议】按主题在 accessories 中体现：古诗=折扇/油纸伞/书简/团扇；民谣=花束/绸带；童趣=发光道具/气球/彩色纸板；仪式=国旗/花束/横幅；现代=发光手环/LED道具；民族=银饰/长绸/手鼓；国际=国旗/和平鸽。注意与上面硬性禁忌不冲突（如古诗合唱不配电子发光道具）。
`;

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
  const timer = setTimeout(() => ctrl.abort(), 50000);
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
          { role: "system", content: "你是 StageOS 服装总表排产专家，精通学校演出服装采购：学段画像、1688/淘宝/京东价格档、尺码策略、倒排计划与 Plan B 兜底。严格遵循用户提供的领域知识库与结构要求，只返回 JSON。" },
          { role: "user", content: prompt },
        ],
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
    // 容错解析：剥离 markdown 代码围栏，并截取首个 { 到末尾 } 之间的内容
    let raw = content.trim();
    const fence = raw.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
    if (fence) raw = fence[1].trim();
    const first = raw.indexOf("{");
    const last = raw.lastIndexOf("}");
    if (first >= 0 && last > first) raw = raw.slice(first, last + 1);
    let parsed: unknown;
    try { parsed = JSON.parse(raw); } catch {
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

    const prompt = `请为以下学校演出项目生成服装总表方案。\n项目标题: ${project.title}\n演出日期: ${project.performance_date ?? "未定"}\nStageInput: ${JSON.stringify(input)}\n\n${DOMAIN_KNOWLEDGE}\n${PLAN_SCHEMA_HINT}`;

    const ai = await callAiGateway(prompt, apiKey);
    if (!ai.ok) return json({ ok: false, code: ai.code, message: ai.message, aiFailed: true }, 502);
    const shape = validatePlanShape(ai.data);
    if (!shape.ok) return json({ ok: false, code: "AI_SHAPE_INVALID", message: `AI 输出结构不合规，缺少: ${shape.missing.join(", ")}`, missing: shape.missing, aiFailed: true }, 502);

    return json({ ok: true, mode: "ai", plan: ai.data });
  } catch (e) {
    return json({ ok: false, code: "INTERNAL", message: (e as Error).message ?? "internal error" }, 500);
  }
});
