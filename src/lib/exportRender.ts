// Renders export payloads to Markdown and printable HTML.
// Never throws; missing sections show a placeholder.

const MISSING = "_（本快照缺少此字段）_";

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
  ext: "md" | "pdf",
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
  const recs = d?.searchRecommendations ?? d?.plan?.searchRecommendations ?? d?.recommendations;
  if (!Array.isArray(recs) || !recs.length) return MISSING;
  return recs.map((r: any) => {
    if (typeof r === "string") return `- ${r}`;
    const q = r.query ?? r.keyword ?? r.q ?? "";
    const platform = r.platform ?? "";
    return `- ${platform ? `**${platform}**：` : ""}${q}`;
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
  const md = renderMarkdown(payload, format, meta);
  const body = mdToHtml(md);
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
    padding: 8pt 4pt;
    word-break: break-word;
  }
  h1 { font-size: 20pt; margin: 0 0 6pt; border-bottom: 2px solid #111; padding-bottom: 4pt; }
  h2 { font-size: 14pt; margin: 14pt 0 4pt; border-left: 4px solid #333; padding-left: 6pt; }
  h3 { font-size: 12pt; margin: 8pt 0 2pt; color: #333; }
  p { margin: 4pt 0; }
  ul { padding-left: 18pt; margin: 4pt 0; }
  li { margin: 2pt 0; }
  blockquote { border-left: 3px solid #999; color: #555; padding: 2pt 8pt; margin: 6pt 0; background: #f6f6f6; }
  table { border-collapse: collapse; width: 100%; margin: 6pt 0; font-size: 10.5pt; }
  th, td { border: 1px solid #999; padding: 4pt 6pt; text-align: left; vertical-align: top; }
  th { background: #f0f0f0; }
  code { font-family: ui-monospace, "SFMono-Regular", Menlo, Consolas, monospace; background: #f2f2f2; padding: 0 3pt; border-radius: 2px; }
  pre { background: #f6f6f6; padding: 6pt; border-radius: 3px; overflow-x: auto; font-size: 10pt; }
  hr { border: none; border-top: 1px dashed #bbb; margin: 10pt 0; }
  strong { color: #000; }
</style>
</head>
<body>
${body}
</body>
</html>`;
}

function escapeHtml(s: string) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
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
  if (typeof window === "undefined") throw new Error("PDF_UNSUPPORTED");
  // Dynamic import — keeps html2pdf.js out of the initial bundle.
  const mod: any = await import("html2pdf.js");
  const html2pdf = mod.default ?? mod;

  // Off-screen host so the DOM has real width for html2canvas to measure.
  const host = document.createElement("div");
  host.style.position = "fixed";
  host.style.left = "-10000px";
  host.style.top = "0";
  host.style.width = "794px"; // ~A4 @ 96dpi
  host.style.background = "#ffffff";
  // Strip outer <!doctype>/<html>/<head> — html2canvas only renders <body>.
  const bodyMatch = /<body[^>]*>([\s\S]*?)<\/body>/i.exec(html);
  const styleMatch = /<style[^>]*>([\s\S]*?)<\/style>/i.exec(html);
  host.innerHTML =
    (styleMatch ? `<style>${styleMatch[1]}</style>` : "") +
    (bodyMatch ? bodyMatch[1] : html);
  document.body.appendChild(host);

  try {
    await html2pdf()
      .from(host)
      .set({
        margin: [10, 10, 12, 10],
        filename,
        image: { type: "jpeg", quality: 0.95 },
        html2canvas: {
          scale: 2,
          useCORS: true,
          backgroundColor: "#ffffff",
          logging: false,
        },
        jsPDF: { unit: "mm", format: "a4", orientation: "portrait" },
        pagebreak: { mode: ["css", "legacy"] },
      })
      .save();
  } finally {
    try { host.remove(); } catch { /* noop */ }
  }
}
