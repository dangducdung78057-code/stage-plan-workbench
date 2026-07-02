// Renders export payloads to Markdown and printable HTML.
// Never throws; missing sections show a placeholder.

import { PROGRAM_TYPES, SCHOOL_STAGES } from "@/lib/stageos";

const MISSING = "_（本快照缺少此字段）_";
const HTML_MISSING = "（本快照缺少此字段）";
const MIN_RENDER_BLOB_SIZE = 1024;

export function slug(s: string | undefined | null, fallback = "project"): string {
  if (!s) return fallback;
  const cleaned = s
    .replace(/[\s\/\\:*?"<>|]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .trim();
  return cleaned || fallback;
}

export function stamp(d: Date = new Date()): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}${p(d.getHours())}${p(d.getMinutes())}`;
}

export function buildFilename(
  ext: "md" | "pdf" | "png",
  projectTitle: string | undefined,
  version: number,
  projectId: string,
): string {
  const base = slug(projectTitle, projectId.slice(0, 8));
  return `stageos-${base}-v${version}-${stamp()}.${ext}`;
}

function parsePayload(payload: string, format: string): any {
  if (format === "json") {
    try { return JSON.parse(payload); } catch { return null; }
  }
  // markdown or other — try JSON anyway (some payloads may embed JSON)
  try { return JSON.parse(payload); } catch { return null; }
}

function section(title: string, body: string): string {
  return `## ${title}\n\n${body || MISSING}\n`;
}

function fmtProject(d: any): string {
  if (!d) return MISSING;
  const p = d.project ?? d;
  if (!p) return MISSING;
  const rows = [
    ["标题", p.title],
    ["学段", p.schoolStage ?? p.school_stage],
    ["节目类型", p.programType ?? p.program_type],
    ["总人数", p.performerCount ?? p.performer_count],
    ["女生", p.femaleCount ?? p.female_count],
    ["男生", p.maleCount ?? p.male_count],
    ["预算", p.budget],
    ["状态", p.status],
  ].filter(([, v]) => v !== undefined && v !== null && v !== "");
  if (!rows.length) return MISSING;
  return rows.map(([k, v]) => `- **${k}**：${v}`).join("\n");
}

function fmtRoster(d: any): string {
  const roster = d?.roster ?? d?.project?.roster ?? d?.students;
  if (!Array.isArray(roster) || roster.length === 0) return MISSING;
  const head = "| studentId | gender | height | role |\n|---|---|---|---|";
  const rows = roster.map((s: any) =>
    `| ${s.studentId ?? s.id ?? "-"} | ${s.gender ?? "-"} | ${s.height ?? "-"} | ${s.role ?? "-"} |`
  );
  return [head, ...rows].join("\n");
}

function fmtCostume(d: any): string {
  const plan = d?.plan ?? d?.costume ?? d;
  if (!plan) return MISSING;
  const parts: string[] = [];
  const blocks = [
    ["女生方案", plan.femalePlan ?? plan.female],
    ["男生方案", plan.malePlan ?? plan.male],
    ["配饰", plan.accessories],
  ];
  for (const [name, items] of blocks) {
    if (!items) continue;
    if (Array.isArray(items) && items.length) {
      parts.push(`### ${name}\n\n` + items.map((it: any) => {
        if (typeof it === "string") return `- ${it}`;
        const label = it.name ?? it.title ?? it.item ?? "项";
        const price = it.price ?? it.estimatedPrice;
        const qty = it.quantity ?? it.count;
        return `- ${label}${qty ? ` × ${qty}` : ""}${price !== undefined ? ` · ¥${price}` : ""}`;
      }).join("\n"));
    } else if (typeof items === "object") {
      parts.push(`### ${name}\n\n\`\`\`json\n${JSON.stringify(items, null, 2)}\n\`\`\``);
    }
  }
  const total = plan.totalEstimate ?? plan.total;
  if (total !== undefined) parts.push(`**合计估算**：¥${total}`);
  return parts.length ? parts.join("\n\n") : MISSING;
}

function fmtList(items: any, formatter?: (x: any) => string): string {
  if (!Array.isArray(items) || items.length === 0) return MISSING;
  return items.map((it) => `- ${formatter ? formatter(it) : (typeof it === "string" ? it : JSON.stringify(it))}`).join("\n");
}

function fmtSchedule(d: any): string {
  const sched = d?.reverseSchedule ?? d?.schedule ?? d?.plan?.reverseSchedule;
  if (!Array.isArray(sched) || !sched.length) return MISSING;
  const head = "| 里程碑 | 日期 | 负责 |\n|---|---|---|";
  const rows = sched.map((s: any) =>
    `| ${s.milestone ?? s.name ?? "-"} | ${s.date ?? s.deadline ?? "-"} | ${s.owner ?? "-"} |`
  );
  return [head, ...rows].join("\n");
}

function fmtSearch(d: any): string {
  const recs =
    d?.platform_search ?? d?.platformSearch ??
    d?.procurementSearch ?? d?.procurement_search ??
    d?.commerceSuggestions ?? d?.commerce_suggestions ??
    d?.searchSuggestions ?? d?.search_suggestions ??
    d?.searchRecommendations ?? d?.search_recommendations ??
    d?.snapshot?.platform_search ?? d?.snapshot?.platformSearch ??
    d?.snapshot?.procurementSearch ?? d?.snapshot?.commerceSuggestions ??
    d?.snapshot?.searchSuggestions ??
    d?.plan?.platformSearch ?? d?.plan?.platform_search ??
    d?.plan?.procurementSearch ?? d?.plan?.commerceSuggestions ??
    d?.plan?.searchSuggestions ?? d?.plan?.searchRecommendations ??
    d?.recommendations;
  if (!Array.isArray(recs) || !recs.length) {
    return "暂无采购搜索建议，需人工检索与核验。";
  }
  return recs.map((r: any) => {
    if (typeof r === "string") return `- ${r}`;
    const q = r.query ?? r.keyword ?? r.q ?? "";
    const platform = r.platform ?? "";
    const note = r.note ?? r.url ?? "";
    const tail = note ? ` — ${note}` : "";
    return `- ${platform ? `**${platform}**：` : ""}${q}${tail}`;
  }).join("\n") + `\n\n> 平台搜索建议仅供人工核验，非实时库存价格。`;
}

export function renderMarkdown(
  payload: string,
  format: string,
  meta: { projectTitle?: string; version: number; createdAt: string },
): string {
  const data = parsePayload(payload, format);

  // If it's already Markdown and not JSON, prepend header and return as-is with disclaimers appended.
  if (format === "markdown" && data === null) {
    return [
      `# StageOS 排产导出 · ${meta.projectTitle ?? "未命名项目"}`,
      `> 版本 v${meta.version} · 生成于 ${meta.createdAt}`,
      "",
      payload,
      "",
      "---",
      "## mock / 非真实库存价格声明",
      "",
      "本导出所含所有价格、库存、供货商与平台链接均为 mock 或搜索建议，需人工核验，不构成采购承诺。",
      "",
      "## 隐私声明摘要",
      "",
      "本文件仅包含匿名 studentId、性别、身高、可选角色标签；不含真实姓名或联系方式。",
    ].join("\n");
  }

  const header = [
    `# StageOS 排产导出 · ${meta.projectTitle ?? data?.project?.title ?? "未命名项目"}`,
    `> 版本 v${meta.version} · 生成于 ${meta.createdAt}`,
    "",
  ].join("\n");

  const risks = data?.risks ?? data?.plan?.risks;
  const planB = data?.planB ?? data?.plan?.planB;

  return [
    header,
    section("项目信息", fmtProject(data)),
    section("匿名学生数据", fmtRoster(data)),
    section("服装方案", fmtCostume(data)),
    section("风险列表", fmtList(risks, (r) => (typeof r === "string" ? r : `${r.level ?? ""} ${r.message ?? r.text ?? JSON.stringify(r)}`))),
    section("Plan B", fmtList(planB, (r) => (typeof r === "string" ? r : r.description ?? JSON.stringify(r)))),
    section("倒排时间表", fmtSchedule(data)),
    section("采购搜索建议", fmtSearch(data)),
    section("mock / 非真实库存价格声明", "本导出所含所有价格、库存、供货商与平台链接均为 mock 或搜索建议，需人工核验，不构成采购承诺。"),
    section("隐私声明摘要", "本文件仅包含匿名 studentId、性别、身高、可选角色标签；不含真实姓名或联系方式。"),
  ].join("\n");
}

// Minimal Markdown -> HTML for print (headings, lists, tables, bold, blockquote, code)
function mdToHtml(md: string): string {
  const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const lines = md.split(/\r?\n/);
  const out: string[] = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];

    // code fence
    if (/^```/.test(line)) {
      const buf: string[] = [];
      i++;
      while (i < lines.length && !/^```/.test(lines[i])) { buf.push(lines[i]); i++; }
      i++;
      out.push(`<pre><code>${esc(buf.join("\n"))}</code></pre>`);
      continue;
    }

    // table
    if (/^\|.+\|\s*$/.test(line) && i + 1 < lines.length && /^\|[\s\-|:]+\|\s*$/.test(lines[i + 1])) {
      const header = line.split("|").slice(1, -1).map((c) => c.trim());
      i += 2;
      const rows: string[][] = [];
      while (i < lines.length && /^\|.+\|\s*$/.test(lines[i])) {
        rows.push(lines[i].split("|").slice(1, -1).map((c) => c.trim()));
        i++;
      }
      out.push(
        `<table><thead><tr>${header.map((h) => `<th>${inline(h)}</th>`).join("")}</tr></thead><tbody>${
          rows.map((r) => `<tr>${r.map((c) => `<td>${inline(c)}</td>`).join("")}</tr>`).join("")
        }</tbody></table>`,
      );
      continue;
    }

    const h = /^(#{1,4})\s+(.*)$/.exec(line);
    if (h) { const lvl = h[1].length; out.push(`<h${lvl}>${inline(h[2])}</h${lvl}>`); i++; continue; }

    if (/^>\s?/.test(line)) { out.push(`<blockquote>${inline(line.replace(/^>\s?/, ""))}</blockquote>`); i++; continue; }

    if (/^[-*]\s+/.test(line)) {
      const buf: string[] = [];
      while (i < lines.length && /^[-*]\s+/.test(lines[i])) { buf.push(lines[i].replace(/^[-*]\s+/, "")); i++; }
      out.push(`<ul>${buf.map((b) => `<li>${inline(b)}</li>`).join("")}</ul>`);
      continue;
    }

    if (/^---+\s*$/.test(line)) { out.push("<hr />"); i++; continue; }

    if (line.trim() === "") { out.push(""); i++; continue; }

    out.push(`<p>${inline(line)}</p>`);
    i++;
  }
  return out.join("\n");

  function inline(s: string): string {
    return esc(s)
      .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
      .replace(/\*(.+?)\*/g, "<em>$1</em>")
      .replace(/`([^`]+)`/g, "<code>$1</code>")
      .replace(/_（(.+?)）_/g, "<em>（$1）</em>");
  }
}

export function renderPrintableHtml(
  payload: string,
  format: string,
  meta: { projectTitle?: string; version: number; createdAt: string; filenameTitle: string },
): string {
  const data = parsePayload(payload, format);
  const doc = buildPrintableDoc(data, payload, format, meta);
  const title = doc.projectTitle || "未命名项目";
  return `<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8" />
<title>${escapeHtml(meta.filenameTitle)}</title>
<style>
  @page { size: A4; margin: 18mm 16mm; }
  html, body { margin: 0; padding: 0; }
  body {
    font-family: -apple-system, BlinkMacSystemFont, "PingFang SC", "Microsoft YaHei",
      "Noto Sans CJK SC", "Source Han Sans SC", "Hiragino Sans GB", "Heiti SC",
      "WenQuanYi Micro Hei", "Segoe UI", Arial, sans-serif;
    color: #111;
    line-height: 1.55;
    font-size: 12pt;
    padding: 0;
    word-break: break-word;
    background: #fff;
  }
  .stageos-print-doc { box-sizing: border-box; width: 100%; max-width: 794px; margin: 0 auto; padding: 28px 28px 34px; background: #fff; color: #111; }
  .doc-kicker { font-size: 9pt; color: #555; letter-spacing: .04em; text-transform: uppercase; margin-bottom: 4pt; }
  h1 { font-size: 20pt; margin: 0 0 6pt; border-bottom: 2px solid #111; padding-bottom: 5pt; line-height: 1.25; }
  h2 { font-size: 14pt; margin: 16pt 0 5pt; border-left: 4px solid #333; padding-left: 6pt; line-height: 1.3; }
  h3 { font-size: 12pt; margin: 9pt 0 3pt; color: #333; }
  p { margin: 4pt 0; }
  ul { padding-left: 18pt; margin: 4pt 0; }
  li { margin: 2pt 0; }
  .meta-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 4pt 10pt; margin: 8pt 0 10pt; }
  .meta-item { border: 1px solid #d7d7d7; padding: 5pt 6pt; background: #fafafa; }
  .meta-label { display: block; font-size: 8.5pt; color: #666; margin-bottom: 1pt; }
  .meta-value { font-size: 10.5pt; color: #111; font-weight: 600; }
  .notice { border: 1px solid #c8c8c8; background: #f7f7f7; padding: 6pt 8pt; margin: 8pt 0; color: #333; }
  blockquote { border-left: 3px solid #999; color: #555; padding: 2pt 8pt; margin: 6pt 0; background: #f6f6f6; }
  table { border-collapse: collapse; width: 100%; margin: 6pt 0; font-size: 10.5pt; }
  th, td { border: 1px solid #999; padding: 4pt 6pt; text-align: left; vertical-align: top; }
  th { background: #f0f0f0; }
  code { font-family: ui-monospace, "SFMono-Regular", Menlo, Consolas, monospace; background: #f2f2f2; padding: 0 3pt; border-radius: 2px; }
  pre { background: #f6f6f6; padding: 6pt; border-radius: 3px; overflow-x: auto; font-size: 10pt; }
  hr { border: none; border-top: 1px dashed #bbb; margin: 10pt 0; }
  strong { color: #000; }
  .footer-note { margin-top: 14pt; padding-top: 8pt; border-top: 1px solid #bbb; color: #444; font-size: 10pt; }
</style>
</head>
<body>
<article class="stageos-print-doc" data-project-title="${escapeHtml(title)}">
  <div class="doc-kicker">StageOS Costume Master Plan · mock operations export</div>
  <h1>StageOS 服装总表导出 · ${escapeHtml(title)}</h1>
  <div class="notice">mock 模式说明：当前 v2 使用规则化 mock 生成，所有商品、库存、价格与平台结果均需人工核验，不代表真实采购承诺。</div>
  <section aria-label="项目信息">
    <h2>项目信息</h2>
    <div class="meta-grid">
      ${metaItem("项目标题", title)}
      ${metaItem("生成时间", doc.generatedAt)}
      ${metaItem("学段", doc.schoolStage)}
      ${metaItem("节目类型", doc.programType)}
      ${metaItem("演出日期", doc.performanceDate)}
      ${metaItem("总人数", doc.performerSummary)}
      ${metaItem("预算", doc.budget)}
      ${metaItem("版本 / 模式", `v${meta.version} · ${doc.mode}`)}
    </div>
  </section>
  ${planSection("女生方案", doc.femalePlan)}
  ${planSection("男生方案", doc.malePlan)}
  ${planSection("配饰", doc.accessories)}
  <section><h2>合计估算</h2><p><strong>${escapeHtml(doc.totalEstimate)}</strong></p></section>
  <section><h2>风险列表</h2>${listHtml(doc.risks)}</section>
  <section><h2>Plan B 与采购策略</h2><h3>Plan B</h3>${listHtml(doc.planB)}<h3>采购策略</h3>${listHtml(doc.purchaseStrategy)}</section>
  <section><h2>倒排时间表</h2>${scheduleTable(doc.schedule)}</section>
  <section><h2>采购搜索建议</h2>${searchTable(doc.search)}</section>
  <section><h2>隐私与非真实库存/价格声明</h2><p>隐私声明：导出仅面向匿名学生数据、人数、身高分档和角色标签，不包含真实姓名、联系方式或敏感身份信息。</p><p>非真实库存/价格声明：本文件中的价格、SKU、库存、供应商和平台搜索建议均为 mock / 模拟或人工检索建议，需由采购负责人二次确认。</p></section>
</article>
</body>
</html>`;
}

export function validatePrintableHtml(html: string): boolean {
  if (!html || typeof html !== "string" || html.trim().length === 0) return false;
  const text = stripHtml(html).replace(/\s+/g, " ").trim();
  if (text.length <= 100) return false;
  const projectTitleAttr = unescapeHtml(/data-project-title="([^"]+)"/i.exec(html)?.[1] ?? "").trim();
  const hasProjectTitle =
    /项目标题\s*[：:]\s*\S+/.test(text) ||
    (!!projectTitleAttr && text.includes(projectTitleAttr));
  if (!hasProjectTitle) return false;
  if (!/(mock|模拟)/i.test(text)) return false;
  if (!/(女生方案|男生方案|配饰)/.test(text)) return false;
  return true;
}

/**
 * Stricter content check for PNG/PDF: the payload must actually contain
 * project title data, at least one plan section with rows, a risks list,
 * and the privacy disclaimer. Prevents "looks-fine but empty" exports.
 */
export function validatePrintableContent(html: string): { ok: boolean; missing: string[] } {
  const missing: string[] = [];
  if (!validatePrintableHtml(html)) return { ok: false, missing: ["printable html invalid"] };
  const text = stripHtml(html).replace(/\s+/g, " ").trim();
  const titleAttr = unescapeHtml(/data-project-title="([^"]+)"/i.exec(html)?.[1] ?? "").trim();
  if (!titleAttr || titleAttr === "未命名项目") missing.push("项目标题");
  // At least one plan section with an actual row (not "本快照缺少此字段")
  const planHtmlSlice = html.match(/女生方案[\s\S]*?配饰[\s\S]*?<\/section>/i)?.[0] ?? html;
  const planHasRow = /<tbody>[\s\S]*?<tr>[\s\S]*?<td>[\s\S]*?<\/td>[\s\S]*?<\/tr>[\s\S]*?<\/tbody>/i.test(planHtmlSlice);
  if (!planHasRow) missing.push("女生方案/男生方案 表格数据");
  // Risks: expect at least one <li> under 风险列表
  const risksSlice = html.match(/风险列表[\s\S]*?<\/section>/i)?.[0] ?? "";
  if (!/<li>/i.test(risksSlice)) missing.push("风险列表");
  if (!/隐私声明/.test(text)) missing.push("隐私声明");
  return { ok: missing.length === 0, missing };
}


function buildPrintableDoc(data: any, rawPayload: string, format: string, meta: { projectTitle?: string; version: number; createdAt: string }) {
  // Always compute an MD fallback so JSON+MD payloads produce identical printable content.
  const md = parseMarkdownPayload(rawPayload);

  const project = data?.project ?? data?.input?.project ?? md.project ?? {};
  const input = data?.input ?? data?.stageInput ?? data?.stage_input ?? data?.project?.input ?? md.input ?? {};
  const snapshot = data?.snapshot ?? data?.planSnapshot ?? data?.plan_snapshot ?? data ?? {};
  const plan =
    data?.plan ?? data?.costumePlan ?? data?.costume_plan ??
    snapshot?.costume_plan ?? snapshot?.costumePlan ?? snapshot?.plan ?? data?.costume ?? md.plan ?? {};

  const projectTitle = value(meta.projectTitle, project.title, input.title, data?.title, md.project?.title, "未命名项目");
  const generatedAt = value(meta.createdAt, snapshot.generated_at, snapshot.generatedAt, data?.exportedAt, data?.created_at, "—");
  const schoolStage = labelOf(SCHOOL_STAGES, value(input.schoolStage, input.school_stage, project.schoolStage, project.school_stage, md.input?.schoolStage));
  const programType = labelOf(PROGRAM_TYPES, value(input.programType, input.program_type, project.programType, project.program_type, md.input?.programType));
  const performanceDate = value(input.performanceDate, input.performance_date, project.performanceDate, project.performance_date, md.input?.performanceDate, "—");
  const performerCount = value(input.performerCount, input.performer_count, project.performerCount, project.performer_count, md.input?.performerCount, "—");
  const maleCount = value(input.maleCount, input.male_count, project.maleCount, project.male_count, md.input?.maleCount, "—");
  const femaleCount = value(input.femaleCount, input.female_count, project.femaleCount, project.female_count, md.input?.femaleCount, "—");
  const budget = value(input.perPersonBudget, input.per_person_budget, project.budget, plan.budget, md.input?.perPersonBudget, "—");
  const mode = value(snapshot.mode, data?.mode, md.snapshot?.mode, format === "json" ? "mock" : "markdown/mock", "mock");
  const risks = firstNonEmpty(arrayOf(data?.risks, snapshot?.risks, plan?.risks), md.risks);
  const planB = firstNonEmpty(arrayOf(data?.planB, data?.plan_b, plan?.planB, plan?.plan_b, snapshot?.planB, snapshot?.plan_b), md.planB);
  const purchaseStrategy = firstNonEmpty(arrayOf(plan?.purchaseStrategy, plan?.purchase_strategy, data?.purchaseStrategy, data?.purchase_strategy), md.purchaseStrategy);
  const schedule = firstNonEmpty(arrayOf(data?.reverseSchedule, data?.reverse_schedule, snapshot?.reverse_schedule, snapshot?.reverseSchedule, plan?.reverseSchedule, plan?.schedule), md.schedule);
  const search = firstNonEmpty(arrayOf(
    data?.platform_search, data?.platformSearch,
    data?.procurementSearch, data?.procurement_search,
    data?.commerceSuggestions, data?.commerce_suggestions,
    data?.searchSuggestions, data?.search_suggestions,
    data?.searchRecommendations, data?.search_recommendations,
    snapshot?.platform_search, snapshot?.platformSearch,
    snapshot?.procurementSearch, snapshot?.procurement_search,
    snapshot?.commerceSuggestions, snapshot?.commerce_suggestions,
    snapshot?.searchSuggestions, snapshot?.search_suggestions,
    plan?.platformSearch, plan?.platform_search,
    plan?.procurementSearch, plan?.commerceSuggestions,
    plan?.searchSuggestions, plan?.searchRecommendations,
  ), md.search);
  const totalEstimateRaw = value(plan?.totalEstimate, plan?.total_estimate, plan?.total, md.plan?.totalEstimate, "—");

  return {
    projectTitle,
    generatedAt,
    schoolStage,
    programType,
    performanceDate,
    performerSummary: `${performerCount}（男 ${maleCount} / 女 ${femaleCount}）`,
    budget: budget === "—" ? "—" : `¥${budget}`,
    mode,
    femalePlan: firstNonEmpty(arrayOf(plan?.femalePlan, plan?.female_plan, plan?.female), md.plan?.femalePlan ?? []),
    malePlan: firstNonEmpty(arrayOf(plan?.malePlan, plan?.male_plan, plan?.male), md.plan?.malePlan ?? []),
    accessories: firstNonEmpty(arrayOf(plan?.accessories), md.plan?.accessories ?? []),
    totalEstimate: totalEstimateRaw === "—" ? "—" : `¥${totalEstimateRaw}`,
    risks,
    planB: planB.length ? planB : ["主计划风险控制以人工复核为主。"],
    purchaseStrategy: purchaseStrategy.length ? purchaseStrategy : ["主计划生成后由采购负责人进行人工验样、比价、库存确认和下单复核。"],
    schedule,
    search,
  };
}

function firstNonEmpty<T>(a: T[], b: T[] | undefined | null): T[] {
  if (Array.isArray(a) && a.length) return a;
  if (Array.isArray(b) && b.length) return b;
  return [];
}

/**
 * Extract StageOS fields from a Markdown payload string produced by buildMarkdownExport().
 * Never throws. Missing sections return empty structures.
 */
function parseMarkdownPayload(raw: string): {
  project: any; input: any; plan: any; snapshot: any;
  risks: any[]; planB: any[]; purchaseStrategy: any[]; schedule: any[]; search: any[];
} {
  const empty = { project: {}, input: {}, plan: {}, snapshot: {}, risks: [], planB: [], purchaseStrategy: [], schedule: [], search: [] };
  if (!raw || typeof raw !== "string") return empty;
  const lines = raw.split(/\r?\n/);

  const project: any = {};
  const input: any = {};
  const snapshot: any = {};
  const plan: any = {};
  const risks: any[] = [];
  const planB: any[] = [];
  const schedule: any[] = [];

  const titleMatch = /^#\s+(.+?)\s+—\s+服装总表\s+v(\d+)/.exec(lines.find((l) => /^#\s+/.test(l)) ?? "");
  if (titleMatch) { project.title = titleMatch[1]; snapshot.version = Number(titleMatch[2]); }

  const genMatch = /生成时间[:：]\s*([^·]+)·\s*模式[:：]\s*(\S+)/.exec(raw);
  if (genMatch) { snapshot.generated_at = genMatch[1].trim(); snapshot.mode = genMatch[2].trim(); }

  const bulletField = (label: string) => {
    const re = new RegExp("^[-*]\\s+" + label + "\\s*[:：]\\s*(.+)$", "m");
    const m = re.exec(raw);
    return m ? m[1].trim() : undefined;
  };
  const stage = bulletField("学段"); if (stage) input.schoolStage = stage;
  const prog = bulletField("节目类型"); if (prog) input.programType = prog;
  const perf = bulletField("演出日期"); if (perf) { input.performanceDate = perf; project.performance_date = perf; }
  const totalLine = bulletField("总人数");
  if (totalLine) {
    const nums = /^([\d]+)\s*\(?\s*男\s*([\d]+)\s*\/\s*女\s*([\d]+)/.exec(totalLine);
    if (nums) {
      input.performerCount = Number(nums[1]);
      input.maleCount = Number(nums[2]);
      input.femaleCount = Number(nums[3]);
    } else {
      const n = /^(\d+)/.exec(totalLine); if (n) input.performerCount = Number(n[1]);
    }
  }

  // Parse three plan tables under ## 女生方案 / ## 男生方案 / ## 配饰
  const parsePlanSection = (heading: string): any[] => {
    const rx = new RegExp("^##\\s+" + heading + "\\s*$", "m");
    const idx = raw.split(/\r?\n/).findIndex((l) => rx.test(l));
    if (idx < 0) return [];
    const out: any[] = [];
    for (let i = idx + 1; i < lines.length; i++) {
      const ln = lines[i];
      if (/^##\s+/.test(ln)) break;
      if (!/^\|/.test(ln)) continue;
      if (/^\|[\s\-|:]+\|/.test(ln)) continue;
      const cells = ln.split("|").slice(1, -1).map((c) => c.trim());
      if (cells.length < 2) continue;
      if (cells[0] === "类别" || cells[1] === "描述") continue;
      const [category, description, qty, unitEstimate, subtotal] = cells;
      out.push({
        category,
        description,
        qty: numOrRaw(qty),
        unitEstimate: numOrRaw(unitEstimate),
        subtotal: numOrRaw(subtotal),
      });
    }
    return out;
  };
  plan.femalePlan = parsePlanSection("女生方案");
  plan.malePlan = parsePlanSection("男生方案");
  plan.accessories = parsePlanSection("配饰");

  const totalM = /##\s+总额估算[:：]\s*¥?\s*([\d.]+)/.exec(raw);
  if (totalM) plan.totalEstimate = Number(totalM[1]);

  // ## 风险 → list items like "- **[level] title** — detail"
  const risksBlock = extractListBlock(raw, /^##\s+风险\s*$/m);
  for (const item of risksBlock) {
    const m = /^\*\*\[([^\]]+)\]\s+([^*]+?)\*\*\s*—\s*(.+)$/.exec(item);
    if (m) risks.push({ level: m[1].trim(), title: m[2].trim(), detail: m[3].trim() });
    else risks.push(item);
  }

  // ## 倒排 → "- D-{days} {date} · {task} · {owner}"
  const schedBlock = extractListBlock(raw, /^##\s+倒排\s*$/m);
  for (const item of schedBlock) {
    const m = /^D-(\d+)\s*([\d\-\/]+)?\s*·\s*(.+?)\s*·\s*(.+)$/.exec(item);
    if (m) schedule.push({ daysBefore: Number(m[1]), date: m[2] || "", task: m[3], owner: m[4] });
    else schedule.push(item);
  }

  // ## 采购搜索建议 → "- **平台**：关键词 — 备注"
  const search: any[] = [];
  const searchBlock = extractListBlock(raw, /^##\s+采购搜索建议\s*$/m);
  for (const item of searchBlock) {
    const m = /^\*\*([^*]+)\*\*\s*[:：]\s*(.+?)(?:\s+[—-]\s+(.+))?$/.exec(item);
    if (m) search.push({ platform: m[1].trim(), query: m[2].trim(), note: (m[3] ?? "").trim() || undefined });
    else search.push(item);
  }

  return { project, input, plan, snapshot, risks, planB, purchaseStrategy: [], schedule, search };
}

function numOrRaw(s: string): any {
  if (s === undefined || s === null || s === "") return "";
  const t = s.replace(/[¥,\s]/g, "");
  const n = Number(t);
  return Number.isFinite(n) ? n : s;
}

function extractListBlock(raw: string, headingRx: RegExp): string[] {
  const lines = raw.split(/\r?\n/);
  const idx = lines.findIndex((l) => headingRx.test(l));
  if (idx < 0) return [];
  const out: string[] = [];
  for (let i = idx + 1; i < lines.length; i++) {
    if (/^##\s+/.test(lines[i])) break;
    const m = /^[-*]\s+(.+)$/.exec(lines[i]);
    if (m) out.push(m[1].trim());
  }
  return out;
}


function value(...items: any[]) {
  for (const item of items) {
    if (item !== undefined && item !== null && item !== "") return item;
  }
  return "—";
}

function arrayOf(...items: any[]): any[] {
  for (const item of items) if (Array.isArray(item)) return item;
  return [];
}

function labelOf<const T extends readonly { value: string; label: string }[]>(options: T, v: any) {
  if (!v) return "—";
  return options.find((o) => o.value === v)?.label ?? String(v);
}

function metaItem(label: string, val: any) {
  return `<div class="meta-item"><span class="meta-label">${escapeHtml(label)}</span><span class="meta-value">${escapeHtml(String(val ?? "—"))}</span></div>`;
}

function planSection(title: string, rows: any[]) {
  return `<section><h2>${escapeHtml(title)}</h2>${planTable(rows)}</section>`;
}

function planTable(rows: any[]) {
  if (!Array.isArray(rows) || rows.length === 0) return `<p>${HTML_MISSING}</p>`;
  return `<table><thead><tr><th>类别</th><th>描述</th><th>数量</th><th>单价估算</th><th>小计</th><th>尺码/备注</th></tr></thead><tbody>${rows.map((r) => {
    if (typeof r === "string") return `<tr><td>—</td><td>${escapeHtml(r)}</td><td>—</td><td>—</td><td>—</td><td>—</td></tr>`;
    const desc = value(r.description, r.name, r.title, r.item, JSON.stringify(r));
    const qty = value(r.qty, r.quantity, r.count, "—");
    const unit = value(r.unitEstimate, r.unit_estimate, r.price, r.estimatedPrice, "—");
    const subtotal = value(r.subtotal, r.total, "—");
    return `<tr><td>${escapeHtml(String(value(r.category, "—")))}</td><td>${escapeHtml(String(desc))}</td><td>${escapeHtml(String(qty))}</td><td>${escapeHtml(unit === "—" ? "—" : `¥${unit}`)}</td><td>${escapeHtml(subtotal === "—" ? "—" : `¥${subtotal}`)}</td><td>${escapeHtml(String(value(r.sizing, r.note, "—")))}</td></tr>`;
  }).join("")}</tbody></table>`;
}

function listHtml(items: any[]) {
  if (!Array.isArray(items) || items.length === 0) return `<p>${HTML_MISSING}</p>`;
  return `<ul>${items.map((it) => `<li>${escapeHtml(itemText(it))}</li>`).join("")}</ul>`;
}

function scheduleTable(rows: any[]) {
  if (!Array.isArray(rows) || rows.length === 0) return `<p>${HTML_MISSING}</p>`;
  return `<table><thead><tr><th>节点</th><th>日期/D-Day</th><th>任务</th><th>负责人</th></tr></thead><tbody>${rows.map((r, i) => {
    if (typeof r === "string") return `<tr><td>${i + 1}</td><td>—</td><td>${escapeHtml(r)}</td><td>—</td></tr>`;
    const day = r.date ? `${r.date}${r.daysBefore !== undefined ? ` · D-${r.daysBefore}` : ""}` : (r.daysBefore !== undefined ? `D-${r.daysBefore}` : value(r.deadline, "—"));
    return `<tr><td>${i + 1}</td><td>${escapeHtml(String(day))}</td><td>${escapeHtml(String(value(r.task, r.milestone, r.name, "—")))}</td><td>${escapeHtml(String(value(r.owner, "—")))}</td></tr>`;
  }).join("")}</tbody></table>`;
}

function searchTable(rows: any[]) {
  if (!Array.isArray(rows) || rows.length === 0) {
    return `<p>暂无采购搜索建议，需人工检索与核验。</p>`;
  }
  return `<table><thead><tr><th>平台</th><th>关键词</th><th>链接/备注</th></tr></thead><tbody>${rows.map((r) => {
    if (typeof r === "string") return `<tr><td>—</td><td>${escapeHtml(r)}</td><td>人工核验</td></tr>`;
    return `<tr><td>${escapeHtml(String(value(r.platform, "—")))}</td><td>${escapeHtml(String(value(r.query, r.keyword, r.q, "—")))}</td><td>${escapeHtml(String(value(r.note, r.url, "需人工核验")))}</td></tr>`;
  }).join("")}</tbody></table><p>平台搜索建议仅供人工核验，非实时库存价格。</p>`;
}

function itemText(it: any) {
  if (typeof it === "string") return it;
  return value(
    it.detail && it.title ? `[${it.level ?? ""}] ${it.title} — ${it.detail}` : undefined,
    it.description,
    it.message,
    it.text,
    it.title,
    JSON.stringify(it),
  );
}

function fallbackFromMarkdown(raw: string, matcher: RegExp): string[] {
  if (!raw || !matcher.test(raw)) return [];
  return raw.split(/\r?\n/).filter((line) => /^[-*]\s+/.test(line)).slice(0, 8).map((line) => line.replace(/^[-*]\s+/, ""));
}

function escapeHtml(s: string) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function unescapeHtml(s: string) {
  return s.replace(/&quot;/g, '"').replace(/&gt;/g, ">").replace(/&lt;/g, "<").replace(/&amp;/g, "&");
}

function stripHtml(html: string) {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ");
}

export function downloadBlob(content: string, filename: string, mime: string) {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function canPrint(): boolean {
  return typeof window !== "undefined";
}

/**
 * Real PDF download via html2pdf.js (html2canvas + jsPDF).
 * Rasterizes rendered HTML — Chinese text renders through the browser's font stack,
 * no PDF-embedded font needed. Produces an actual .pdf file, not a print dialog.
 */
export async function downloadPdf(html: string, filename: string): Promise<void> {
  const blob = await renderPdfBlob(html);
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/**
 * Render the printable HTML to a real PDF Blob via html2pdf.js (html2canvas + jsPDF).
 * Rasterized — Chinese renders through the browser font stack, no embedded font required.
 */
export async function renderPdfBlob(html: string): Promise<Blob> {
  if (typeof window === "undefined") throw new Error("PDF_UNSUPPORTED");
  if (!validatePrintableHtml(html)) throw new Error("PRINTABLE_HTML_INVALID");

  // Reuse the proven PNG rasterization path (known to produce non-blank output).
  // If that fails or is blank, we abort BEFORE creating a PDF — no blank PDFs.
  let pngBlob: Blob;
  try {
    pngBlob = await renderPngBlob(html, { widthPx: 794, pixelRatio: 2 });
  } catch (e: any) {
    throw new Error("PDF_RASTERIZE_FAILED:" + (e?.message || "png stage failed"));
  }
  if (!pngBlob || pngBlob.size < MIN_RENDER_BLOB_SIZE) {
    throw new Error("PDF_EMPTY_CONTENT:raster blob too small");
  }
  if (!(await pngHasVisibleInk(pngBlob))) {
    throw new Error("PDF_BLANK_PIXELS:no visible ink");
  }

  const dataUrl: string = await new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(new Error("PDF_READ_FAILED"));
    reader.readAsDataURL(pngBlob);
  });

  const bitmap = await createImageBitmap(pngBlob);
  const imgW = bitmap.width;
  const imgH = bitmap.height;
  bitmap.close?.();
  if (!(imgW > 0) || !(imgH > 0)) throw new Error("PDF_EMPTY_CONTENT:bitmap size 0");

  const mod: any = await import("jspdf");
  const JsPDF = mod.jsPDF ?? mod.default?.jsPDF ?? mod.default;
  if (!JsPDF) throw new Error("PDF_LIB_UNAVAILABLE");

  const pdf = new JsPDF({ unit: "mm", format: "a4", orientation: "portrait" });
  const pageW = pdf.internal.pageSize.getWidth();   // 210
  const pageH = pdf.internal.pageSize.getHeight();  // 297
  const margin = 8;
  const drawW = pageW - margin * 2;
  const drawH = (imgH * drawW) / imgW;

  let remaining = drawH;
  let position = margin;
  pdf.addImage(dataUrl, "PNG", margin, position, drawW, drawH, undefined, "FAST");
  remaining -= (pageH - margin * 2);
  while (remaining > 0) {
    position = position - (pageH - margin * 2);
    pdf.addPage();
    pdf.addImage(dataUrl, "PNG", margin, position, drawW, drawH, undefined, "FAST");
    remaining -= (pageH - margin * 2);
  }

  const blob: Blob = pdf.output("blob");
  if (!blob || blob.size < MIN_RENDER_BLOB_SIZE) throw new Error("PDF_EMPTY_CONTENT:pdf blob too small");
  return blob;
}

/**
 * Render the printable HTML into a PNG Blob (long-image, share-friendly).
 * Off-screen but laid-out host so html-to-image can measure & rasterize.
 * Never mutates or replaces the Markdown / Storage export chains.
 * Throws PNG_EMPTY_CONTENT when the mounted node has no measurable content.
 */
export async function renderPngBlob(html: string, opts?: { widthPx?: number; pixelRatio?: number }): Promise<Blob> {
  if (typeof window === "undefined") throw new Error("PNG_UNSUPPORTED");
  if (!validatePrintableHtml(html)) throw new Error("PRINTABLE_HTML_INVALID");
  const content = validatePrintableContent(html);
  if (!content.ok) throw new Error("PNG_INCOMPLETE_PAYLOAD:" + content.missing.join(", "));
  const mod: any = await import("html-to-image");
  const toBlob = mod.toBlob ?? mod.default?.toBlob;
  if (!toBlob) throw new Error("PNG_LIB_UNAVAILABLE");

  const width = opts?.widthPx ?? 794; // ~A4 @96dpi

  // Off-screen but laid-out (no display:none). Must be attached to body.
  const host = document.createElement("div");
  host.setAttribute("data-stageos-png-host", "1");
  host.style.position = "fixed";
  host.style.left = "-10000px";
  host.style.top = "0";
  host.style.width = `${width}px`;
  host.style.background = "#ffffff";
  host.style.opacity = "1";
  host.style.pointerEvents = "none";

  const bodyMatch = /<body[^>]*>([\s\S]*?)<\/body>/i.exec(html);
  const styleMatch = /<style[^>]*>([\s\S]*?)<\/style>/i.exec(html);
  host.innerHTML =
    (styleMatch ? `<style>${styleMatch[1]}</style>` : "") +
    (bodyMatch ? bodyMatch[1] : html);
  document.body.appendChild(host);

  try {
    const { height } = await waitForRenderableHost(host, 100);

    let blob: Blob | null = null;
    try {
      blob = await toBlob(host, {
        backgroundColor: "#ffffff",
        width,
        height,
        pixelRatio: opts?.pixelRatio ?? 2,
        cacheBust: true,
        style: {
          position: "relative",
          left: "0",
          top: "0",
          right: "auto",
          bottom: "auto",
          transform: "none",
          zIndex: "0",
        },
      });
    } catch (e: any) {
      throw new Error("PNG_RASTERIZE_FAILED:" + (e?.message || "toBlob threw"));
    }
    if (!blob) throw new Error("PNG_RASTERIZE_FAILED:toBlob returned null");
    if (blob.size < MIN_RENDER_BLOB_SIZE) throw new Error("PNG_BLOB_TOO_SMALL:" + blob.size + "B");
    if (!(await pngHasVisibleInk(blob))) throw new Error("PNG_BLANK_PIXELS:no visible ink detected");
    return blob;
  } finally {
    try { host.remove(); } catch { /* noop */ }
  }
}

async function waitForRenderableHost(host: HTMLElement, minTextLength: number) {
  let fontsReady = true;
  if ((document as any).fonts?.ready) {
    try { await (document as any).fonts.ready; } catch { fontsReady = false; }
  }
  await new Promise((r) => requestAnimationFrame(() => r(null)));
  await new Promise((r) => requestAnimationFrame(() => r(null)));

  const width = host.offsetWidth;
  const height = host.scrollHeight;
  const textLength = (host.innerText || "").trim().length;
  if (!fontsReady) {
    throw new Error("PNG_FONTS_NOT_READY:document.fonts.ready rejected");
  }
  if (!(width > 0) || !(height > 0)) {
    throw new Error(`PNG_NODE_SIZE_INVALID:width=${width}px height=${height}px`);
  }
  if (textLength <= minTextLength) {
    throw new Error(`PNG_EMPTY_CONTENT:text length ${textLength} <= ${minTextLength}`);
  }
  return { width, height, textLength };
}

async function pngHasVisibleInk(blob: Blob): Promise<boolean> {
  try {
    const bitmap = await createImageBitmap(blob);
    const canvas = document.createElement("canvas");
    const sampleWidth = Math.min(bitmap.width, 160);
    const sampleHeight = Math.min(bitmap.height, 220);
    canvas.width = sampleWidth;
    canvas.height = sampleHeight;
    const ctx = canvas.getContext("2d");
    if (!ctx) return blob.size >= MIN_RENDER_BLOB_SIZE * 4;
    ctx.drawImage(bitmap, 0, 0, sampleWidth, sampleHeight);
    const data = ctx.getImageData(0, 0, sampleWidth, sampleHeight).data;
    bitmap.close?.();
    for (let i = 0; i < data.length; i += 4) {
      const alpha = data[i + 3];
      const r = data[i];
      const g = data[i + 1];
      const b = data[i + 2];
      if (alpha > 0 && (r < 245 || g < 245 || b < 245)) return true;
    }
    return false;
  } catch {
    return blob.size >= MIN_RENDER_BLOB_SIZE * 4;
  }
}
