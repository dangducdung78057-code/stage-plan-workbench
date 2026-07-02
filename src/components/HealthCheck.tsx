import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { ToneBadge } from "@/components/StatusBadge";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { STAGEOS_VERSION } from "@/lib/stageos";
import { getFlag } from "@/lib/featureFlags";
import { PROCUREMENT_SETTINGS_DEFAULTS, normalizeProcurementSettings, procurementSettingsDetail, type ProcurementSettings } from "@/lib/procurementSettings";
import { renderMarkdown, renderPrintableHtml, renderPdfBlob, renderPngBlob, validatePrintableHtml, validatePrintableContent } from "@/lib/exportRender";
import { CheckCircle2, XCircle, Loader2, AlertTriangle, Copy, Download as DownloadIcon, History } from "lucide-react";
import { toast } from "sonner";

const STABLE_BASELINE = "stageos-v3.5-audit-layer-pass";

type Status = "pass" | "fail" | "warn" | "skip";
type Check = { id: string; label: string; status: Status; detail?: string; ms?: number };
type RunRow = {
  id: string;
  baseline: string;
  route: string | null;
  pass_count: number;
  warn_count: number;
  fail_count: number;
  skip_count: number;
  created_at: string;
  is_release?: boolean | null;
  release_note?: string | null;
};

async function timed<T>(fn: () => Promise<T>): Promise<{ result: T; ms: number }> {
  const t0 = performance.now();
  const result = await fn();
  return { result, ms: Math.round(performance.now() - t0) };
}

export function HealthCheck() {
  const { user } = useAuth();
  const [running, setRunning] = useState(false);
  const [checks, setChecks] = useState<Check[]>([]);
  const [startedAt, setStartedAt] = useState<string | null>(null);
  const [recent, setRecent] = useState<RunRow[]>([]);
  const [lastRunId, setLastRunId] = useState<string | null>(null);
  const [compareIds, setCompareIds] = useState<[string | null, string | null]>([null, null]);
  type PdfProbe = { status: Status; reason: string; detail: string; ms?: number };
  const [pdfProbes, setPdfProbes] = useState<{ disabled: PdfProbe; enabled: PdfProbe; error: PdfProbe } | null>(null);

  async function loadRecent() {
    if (!user?.id) { setRecent([]); return; }
    const { data } = await supabase
      .from("health_check_runs")
      .select("id,baseline,route,pass_count,warn_count,fail_count,skip_count,created_at,is_release,release_note")
      .order("created_at", { ascending: false })
      .limit(10);
    setRecent((data ?? []) as RunRow[]);
  }
  useEffect(() => { void loadRecent(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [user?.id]);

  async function run() {
    setRunning(true);
    setChecks([]);
    setStartedAt(new Date().toLocaleString());
    const out: Check[] = [];
    const push = (c: Check) => { out.push(c); setChecks([...out]); };
    let procurementSettings: ProcurementSettings = { ...PROCUREMENT_SETTINGS_DEFAULTS };

    // 1. version tag
    push({
      id: "version",
      label: "版本标记 (STAGEOS_VERSION)",
      status: STAGEOS_VERSION === STABLE_BASELINE ? "pass" : "warn",
      detail: STAGEOS_VERSION,
    });

    // 2. auth session
    try {
      const { result, ms } = await timed(async () => await supabase.auth.getSession());
      const s = result.data.session;
      if (s?.user) {
        push({ id: "auth", label: "登录会话 (auth.session)", status: "pass", detail: s.user.email ?? s.user.id, ms });
      } else {
        push({ id: "auth", label: "登录会话 (auth.session)", status: "fail", detail: "no session", ms });
      }
    } catch (e: any) {
      push({ id: "auth", label: "登录会话 (auth.session)", status: "fail", detail: e?.message });
    }

    // 3-6. table reachability
    const tables = ["projects", "plan_snapshots", "confirmation_records", "export_records"] as const;
    for (const t of tables) {
      try {
        const { result, ms } = await timed(async () => await (
          supabase.from(t).select("id", { count: "exact", head: true }))
        );
        if (result.error) {
          push({ id: `tbl-${t}`, label: `表读取 ${t}`, status: "fail", detail: result.error.message, ms });
        } else {
          push({ id: `tbl-${t}`, label: `表读取 ${t}`, status: "pass", detail: `rows=${result.count ?? 0}`, ms });
        }
      } catch (e: any) {
        push({ id: `tbl-${t}`, label: `表读取 ${t}`, status: "fail", detail: e?.message });
      }
    }

    // 7. user_id 隔离抽样
    if (user?.id) {
      try {
        const { result, ms } = await timed(async () => await (
          supabase.from("projects").select("id,user_id").limit(20))
        );
        if (result.error) {
          push({ id: "rls", label: "user_id 隔离抽样", status: "fail", detail: result.error.message, ms });
        } else {
          const rows = (result.data ?? []) as { user_id: string | null }[];
          const leak = rows.find((r) => r.user_id && r.user_id !== user.id);
          if (leak) {
            push({ id: "rls", label: "user_id 隔离抽样", status: "fail", detail: "检测到跨用户数据", ms });
          } else {
            push({ id: "rls", label: "user_id 隔离抽样", status: "pass", detail: `sample=${rows.length}`, ms });
          }
        }
      } catch (e: any) {
        push({ id: "rls", label: "user_id 隔离抽样", status: "fail", detail: e?.message });
      }
    } else {
      push({ id: "rls", label: "user_id 隔离抽样", status: "skip", detail: "未登录" });
    }

    // 8. settings 全局配置
    try {
      const { result, ms } = await timed(async () => await (
        supabase.from("settings").select("*").eq("id", "global").maybeSingle())
      );
      if (result.error) push({ id: "settings", label: "全局设置读取", status: "fail", detail: result.error.message, ms });
      else {
        procurementSettings = normalizeProcurementSettings(result.data, procurementSettings);
        push({
          id: "settings",
          label: "全局设置读取",
          status: "pass",
          detail: procurementSettingsDetail(procurementSettings, (result.data as any)?.api_mode ?? "mock"),
          ms,
        });
      }
    } catch (e: any) {
      push({ id: "settings", label: "全局设置读取", status: "fail", detail: e?.message });
    }

    // 9. Edge Function plan-precheck 可达性（业务拒绝也算可达）
    try {
      const { result, ms } = await timed(async () => await (
        supabase.functions.invoke("plan-precheck", { body: { healthcheck: true } }))
      );
      const data: any = result.data;
      const code: string | undefined = data?.code;
      const reachableCodes = new Set(["UNAUTHORIZED", "FORBIDDEN", "CONFIRMATION_REQUIRED", "VALIDATION_REQUIRED"]);
      const detail = code === "PRECHECK_HEALTHCHECK_OK"
        ? "可达 (PRECHECK_HEALTHCHECK_OK)"
        : code && reachableCodes.has(code)
          ? `可达 (业务拒绝: ${code})`
          : result.error
            ? `可控异常: ${String(result.error.message ?? "unknown").slice(0, 80)}`
            : "响应异常";
      push({
        id: "edge",
        label: "Edge Function plan-precheck",
        status: code === "PRECHECK_HEALTHCHECK_OK" || data?.ok === true || (code && reachableCodes.has(code)) ? "pass" : "warn",
        detail,
        ms,
      });
    } catch (e: any) {
      push({ id: "edge", label: "Edge Function plan-precheck", status: "warn", detail: `调用异常: ${e?.message ?? "unknown"}` });
    }

    // 10. Markdown 导出能力
    try {
      const md = renderMarkdown("# sample\n\nhealthcheck", "markdown", {
        projectTitle: "健康检查样本",
        version: 0,
        createdAt: new Date().toISOString(),
      });
      const blob = new Blob([md], { type: "text/markdown" });
      const on = getFlag("markdownDownload");
      push({
        id: "md",
        label: "Markdown 导出能力",
        status: blob.size > 0 && on ? "pass" : "warn",
        detail: `bytes=${blob.size}${on ? "" : " (flag off)"}`,
      });
    } catch (e: any) {
      push({ id: "md", label: "Markdown 导出能力", status: "fail", detail: e?.message });
    }

    const samplePayload = JSON.stringify({
      project: { title: "健康检查样本", performance_date: "2026-06-30" },
      input: { schoolStage: "primary", programType: "chorus", performerCount: 2, femaleCount: 1, maleCount: 1, performanceDate: "2026-06-30", perPersonBudget: 120 },
      snapshot: {
        mode: "mock",
        generated_at: new Date().toISOString(),
        costume_plan: {
          femalePlan: [{ category: "上装", description: "白衬衫", qty: 1, unitEstimate: 50, subtotal: 50 }],
          malePlan: [{ category: "上装", description: "西装背心", qty: 1, unitEstimate: 70, subtotal: 70 }],
          accessories: [{ category: "配饰", description: "蝴蝶结", qty: 2, unitEstimate: 10, subtotal: 20 }],
          totalEstimate: 140,
          purchaseStrategy: ["先验样再批量下单"],
          planB: ["改用替代面料"],
        },
        risks: [{ level: "medium", title: "面料缺货", detail: "需提前确认库存" }],
        reverse_schedule: [{ daysBefore: 14, date: "2026-06-16", task: "面料到货", owner: "采购" }],
        platform_search: [{ platform: "淘宝", query: "儿童合唱服", note: "人工核验" }],
      },
    });
    const sampleHtml = renderPrintableHtml(samplePayload, "json", {
      projectTitle: "健康检查样本", version: 0, createdAt: new Date().toISOString(), filenameTitle: "healthcheck",
    });

    // 11. PDF 导出 (v3.4 三态): 显式 PASS/SKIP/WARN + 原因
    let pdfDetail: { status: Status; reason: string; detail: string };
    if (!getFlag("pdfExport")) {
      pdfDetail = {
        status: "skip",
        reason: "PDF disabled by config",
        detail: "pdfExport flag 未开启（Settings → 分支能力开关）",
      };
    } else if (!validatePrintableHtml(sampleHtml)) {
      pdfDetail = {
        status: "warn",
        reason: "PDF generation failed",
        detail: "printable html invalid",
      };
    } else {
      try {
        const { result, ms } = await timed(async () => await renderPdfBlob(sampleHtml));
        const bytes = result?.size ?? 0;
        if (result && bytes > 1024) {
          pdfDetail = { status: "pass", reason: "PDF success", detail: `bytes=${bytes}` };
          push({ id: "pdf", label: "PDF 导出（实验版）", status: "pass", detail: `PDF success — bytes=${bytes}`, ms });
        } else {
          pdfDetail = { status: "warn", reason: "PDF generation failed", detail: `bytes=${bytes}` };
        }
      } catch (e: any) {
        pdfDetail = { status: "warn", reason: "PDF generation failed", detail: e?.message ?? "unknown error" };
      }
    }
    if (pdfDetail.status !== "pass") {
      push({
        id: "pdf",
        label: "PDF 导出（实验版）",
        status: pdfDetail.status,
        detail: `${pdfDetail.reason} — ${pdfDetail.detail}`,
      });
    }
    (checks as any).__pdfDetail = pdfDetail;

    // 11a. PDF 三态调试探针 (v3.4)：仅用于 debug 面板复现 PASS/SKIP/WARN，不进入主验收摘要与结论
    // (a) disabled: 固定 SKIP
    const probeDisabledReason = "PDF disabled by config";
    const probeDisabledDetail = "pdfExport flag 未开启（Settings → 分支能力开关）";

    // (b) enabled: 直接调用 renderPdfBlob(sampleHtml)
    let probeEnabled: { status: Status; reason: string; detail: string; ms?: number };
    try {
      if (!validatePrintableHtml(sampleHtml)) {
        probeEnabled = { status: "warn", reason: "PDF generation failed", detail: "printable html invalid" };
      } else {
        const { result, ms } = await timed(async () => await renderPdfBlob(sampleHtml));
        const bytes = result?.size ?? 0;
        probeEnabled = result && bytes > 1024
          ? { status: "pass", reason: "PDF success", detail: `bytes=${bytes}`, ms }
          : { status: "warn", reason: "PDF generation failed", detail: `bytes=${bytes}`, ms };
      }
    } catch (e: any) {
      probeEnabled = { status: "warn", reason: "PDF generation failed", detail: e?.message ?? "unknown error" };
    }

    // (c) error: 无效 html 期望 WARN
    const invalidHtml = "<div>not a printable doc</div>";
    let probeError: { status: Status; reason: string; detail: string };
    if (validatePrintableHtml(invalidHtml)) {
      try {
        const blob = await renderPdfBlob(invalidHtml);
        probeError = { status: "warn", reason: "PDF generation failed", detail: `bytes=${blob?.size ?? 0}` };
      } catch (e: any) {
        probeError = { status: "warn", reason: "PDF generation failed", detail: e?.message ?? "unknown error" };
      }
    } else {
      probeError = { status: "warn", reason: "PDF generation failed", detail: "printable html invalid (expected)" };
    }

    setPdfProbes({
      disabled: { status: "skip", reason: probeDisabledReason, detail: probeDisabledDetail },
      enabled: probeEnabled,
      error: probeError,
    });







    // 11b. PNG 导出：实际渲染一次非空 blob 且 printable HTML 内容完整（项目标题/方案表格/风险/隐私声明）才 pass
    if (!getFlag("pngExport")) {
      push({ id: "png", label: "PNG 导出（长图分享）", status: "skip", detail: "flag off" });
    } else if (!validatePrintableHtml(sampleHtml)) {
      push({ id: "png", label: "PNG 导出（长图分享）", status: "fail", detail: "printable html invalid" });
    } else {
      const content = validatePrintableContent(sampleHtml);
      if (!content.ok) {
        push({ id: "png", label: "PNG 导出（长图分享）", status: "warn", detail: `内容不完整: ${content.missing.join(", ")}` });
      } else {
        try {
          const { result, ms } = await timed(async () => await renderPngBlob(sampleHtml));
          if (result && result.size > 1024) {
            push({ id: "png", label: "PNG 导出（长图分享）", status: "pass", detail: `bytes=${result.size}`, ms });
          } else {
            push({ id: "png", label: "PNG 导出（长图分享）", status: "fail", detail: "empty blob", ms });
          }
        } catch (e: any) {
          const msg = String(e?.message ?? "unknown");
          push({
            id: "png",
            label: "PNG 导出（长图分享）",
            status: /PNG_INCOMPLETE_PAYLOAD|PNG_EMPTY_CONTENT/.test(msg) ? "warn" : "fail",
            detail: msg,
          });
        }
      }
    }


    // 12. Storage 副本可达性（bucket 存在且当前 user 前缀可 list）
    if (!getFlag("storageUpload")) {
      push({ id: "storage", label: "Storage 副本 (stageos-exports)", status: "skip", detail: "flag off" });
    } else if (!user?.id) {
      push({ id: "storage", label: "Storage 副本 (stageos-exports)", status: "skip", detail: "未登录" });
    } else {
      try {
        const { result, ms } = await timed(async () => await (
          supabase.storage.from("stageos-exports").list(user.id, { limit: 1 }))
        );
        if (result.error) {
          push({ id: "storage", label: "Storage 副本 (stageos-exports)", status: "fail", detail: result.error.message, ms });
        } else {
          push({ id: "storage", label: "Storage 副本 (stageos-exports)", status: "pass", detail: `列出成功 (items=${result.data?.length ?? 0})`, ms });
        }
      } catch (e: any) {
        push({ id: "storage", label: "Storage 副本 (stageos-exports)", status: "fail", detail: e?.message });
      }
    }

    // 13. AI provider 可达性
    //   flag off        → skip
    //   reachable       → pass（业务拒绝 UNAUTHORIZED/FORBIDDEN/CONFIRMATION_REQUIRED/VALIDATION_REQUIRED 均视为可达）
    //   AI_* 错误码     → warn（会走 fallback，不污染 baseline）
    //   完全不可达/异常 → warn（fallback 仍可用，不判 fail）
    if (!getFlag("aiProvider")) {
      push({ id: "ai", label: "AI provider (ai-generate-plan)", status: "skip", detail: "flag off (mock 主流程生效)" });
    } else {
      try {
        const { result, ms } = await timed(async () => await (
          supabase.functions.invoke("ai-generate-plan", { body: { healthcheck: true } }))
        );
        const data: any = result.data;
        const code: string | undefined = data?.code;
        const reachableCodes = new Set(["AI_HEALTHCHECK_OK", "UNAUTHORIZED", "FORBIDDEN", "CONFIRMATION_REQUIRED", "VALIDATION_REQUIRED", "BAD_REQUEST"]);
        if (code === "AI_HEALTHCHECK_OK" || data?.ok === true) {
          push({ id: "ai", label: "AI provider (ai-generate-plan)", status: "pass", detail: code ? `可达 (${code})` : "AI 可达", ms });
        } else if (code && reachableCodes.has(code)) {
          push({ id: "ai", label: "AI provider (ai-generate-plan)", status: "pass", detail: `可达 (业务拒绝: ${code})`, ms });
        } else if (code && code.startsWith("AI_")) {
          push({ id: "ai", label: "AI provider (ai-generate-plan)", status: "warn", detail: `AI 不可用，将 fallback mock (${code})`, ms });
        } else if (result.error) {
          push({ id: "ai", label: "AI provider (ai-generate-plan)", status: "warn", detail: `边缘函数异常，将 fallback mock (${String(result.error.message ?? "").slice(0, 80)})`, ms });
        } else {
          push({ id: "ai", label: "AI provider (ai-generate-plan)", status: "warn", detail: "响应异常，将 fallback mock", ms });
        }
      } catch (e: any) {
        push({ id: "ai", label: "AI provider (ai-generate-plan)", status: "warn", detail: `调用异常，将 fallback mock: ${e?.message ?? "unknown"}` });
      }
    }

    // 14. 采购候选商品 v1 · 本地目录
    if (!procurementSettings.procurementCandidatesEnabled) {
      push({ id: "procurement", label: "采购候选商品 v1", status: "skip", detail: "procurementCandidatesEnabled=false" });
    } else {
      try {
        const { PROCUREMENT_CATALOG } = await import("@/lib/procurementCatalog");
        const { matchCandidates } = await import("@/lib/procurementMatch");
        if (!Array.isArray(PROCUREMENT_CATALOG) || PROCUREMENT_CATALOG.length === 0) {
          push({ id: "procurement", label: "采购候选商品 v1 (本地目录)", status: "warn", detail: "本地目录为空" });
        } else {
          const sample = matchCandidates(
            { category: "上装", description: "白衬衫" },
            { programType: "chorus", schoolStage: "primary" },
          );
          if (!Array.isArray(sample) || sample.length === 0) {
            push({ id: "procurement", label: "采购候选商品 v1 (本地目录)", status: "warn", detail: "匹配返回空结果" });
          } else {
            const c = sample[0];
            const ok = !!(c.platform && c.title && c.keyword && typeof c.estimatedPrice === "number" && c.matchReason && c.riskNote);
            push({
              id: "procurement",
              label: "采购候选商品 v1",
              status: ok ? "pass" : "warn",
              detail: ok ? `entries=${PROCUREMENT_CATALOG.length}, sample=${sample.length}` : "候选字段缺失",
            });
          }
        }
      } catch (e: any) {
        push({ id: "procurement", label: "采购候选商品 v1 (本地目录)", status: "warn", detail: `匹配异常: ${e?.message ?? "unknown"}` });
      }
    }

    // 15. 采购 provider 抽象层 v3.1 · fallback hardening
    //   mode=local                    → pass
    //   mode=http + reachable + valid → pass
    //   mode=http + 任何失败态         → warn + fallback local（永不 fail）
    let providerDetail: {
      providerMode: string;
      providerId: string;
      fallbackUsed: boolean;
      candidates: number;
      warningCode?: string;
    } | null = null;

    if (!procurementSettings.procurementProviderEnabled) {
      push({ id: "procurementProvider", label: "采购 provider (v3.2 抽象层 + http-mock)", status: "skip", detail: "procurementProviderEnabled=false" });
    } else {
      try {
        const { searchWithFallback, getHttpUrl, setProviderMode, setHttpUrl } = await import("@/lib/procurementProvider");
        setProviderMode(procurementSettings.procurementProvider);
        setHttpUrl(procurementSettings.procurementApiBaseUrl);
        const r = await searchWithFallback(
          { category: "上装", description: "白衬衫" },
          { programType: "chorus", schoolStage: "primary" },
        );
        providerDetail = {
          providerMode: r.providerMode,
          providerId: r.providerId,
          fallbackUsed: r.fallbackUsed,
          candidates: r.candidates.length,
          warningCode: r.warningCode,
        };
        const base = `mode=${r.providerMode}, providerId=${r.providerId}, fallbackUsed=${r.fallbackUsed}, candidates=${r.candidates.length}${r.warningCode ? `, warningCode=${r.warningCode}` : ""}`;
        if (r.providerMode === "local") {
          push({
            id: "procurementProvider",
            label: "采购 provider (local)",
            status: r.candidates.length > 0 ? "pass" : "warn",
            detail: base,
          });
        } else {
          // http mode
          if (r.fallbackUsed) {
            push({
              id: "procurementProvider",
              label: "采购 provider (http → fallback-local)",
              status: "warn",
              detail: `${r.warning ?? "HTTP 不可用，已 fallback local"} · ${base}${getHttpUrl() ? "" : " · (endpoint 未配置)"}`,
            });
          } else {
            push({
              id: "procurementProvider",
              label: r.providerId === "http-mock" ? "采购 provider (http-mock)" : "采购 provider (http)",
              status: r.candidates.length > 0 ? "pass" : "warn",
              detail: base,
            });
          }
        }
      } catch (e: any) {
        // 抽象层理论上不抛，兜底 warn
        push({ id: "procurementProvider", label: "采购 provider (v3.2 抽象层)", status: "warn", detail: `provider 异常: ${e?.message ?? "unknown"}` });
      }
    }
    // 暴露给 summary 文本使用
    (out as any).__providerDetail = providerDetail;

    // 16. v3.3 · 采购候选商品导出附加
    //   flag off               → skip
    //   provider 返回候选 & MD 章节存在 → pass
    //   provider 无候选但导出正常 → warn
    //   永不 fail
    if (!procurementSettings.procurementExportAttachmentEnabled) {
      push({ id: "procurementExport", label: "采购导出附加 (v3.3)", status: "skip", detail: "procurementExportAttachmentEnabled=false" });
    } else {
      try {
        const { setProviderMode, setHttpUrl } = await import("@/lib/procurementProvider");
        setProviderMode(procurementSettings.procurementProvider);
        setHttpUrl(procurementSettings.procurementApiBaseUrl);
        const { resolveExportProcurement } = await import("@/lib/procurementExport");
        const samplePlan = {
          femalePlan: [{ category: "上装", description: "白衬衫", qty: 1, unitEstimate: 50, subtotal: 50 }],
          malePlan: [{ category: "上装", description: "西装背心", qty: 1, unitEstimate: 70, subtotal: 70 }],
          accessories: [{ category: "配饰", description: "蝴蝶结", qty: 2, unitEstimate: 10, subtotal: 20 }],
        };
        const { result: bundle, ms } = await timed(async () => await resolveExportProcurement(samplePlan, { programType: "chorus", schoolStage: "primary" }));
        // 重新构造 payload + 渲染 markdown，校验 "候选商品清单" 章节是否落地
        const md = renderMarkdown(
          { ...JSON.parse(JSON.stringify({
            project: { title: "健康检查样本", performance_date: "2026-06-30" },
            input: { schoolStage: "primary", programType: "chorus", performerCount: 2, femaleCount: 1, maleCount: 1, performanceDate: "2026-06-30", perPersonBudget: 120 },
            snapshot: { mode: "mock", generated_at: new Date().toISOString(), costume_plan: samplePlan, risks: [], reverse_schedule: [], platform_search: [] },
          })), procurement_candidates: bundle },
          "json",
          { projectTitle: "健康检查样本", version: 0, createdAt: new Date().toISOString() },
        );
        const hasSection = /##\s+候选商品清单/.test(md);
        const hasProviderMeta = /providerId:\s*`([^`]+)`/.test(md);
        const empty = (bundle.totalCandidates ?? 0) === 0;
        const base = `mode=${bundle.providerMode}, providerId=${bundle.providerId}, fallbackUsed=${bundle.fallbackUsed}, groups=${bundle.groups.length}, candidates=${bundle.totalCandidates}${bundle.warningCode ? `, warningCode=${bundle.warningCode}` : ""}`;
        if (!hasSection || !hasProviderMeta) {
          push({ id: "procurementExport", label: "采购导出附加 (v3.3)", status: "warn", detail: `导出章节缺失 · ${base}`, ms });
        } else if (empty) {
          push({ id: "procurementExport", label: "采购导出附加 (v3.3)", status: "warn", detail: `导出章节已附加但候选为空 · ${base}`, ms });
        } else {
          push({ id: "procurementExport", label: "采购导出附加 (v3.3)", status: "pass", detail: base, ms });
        }
      } catch (e: any) {
        push({ id: "procurementExport", label: "采购导出附加 (v3.3)", status: "warn", detail: `附加异常: ${e?.message ?? "unknown"}` });
      }
    }





    // persist run history (best-effort; RLS scopes to current user)
    const summaryLocal = out.reduce(
      (a, c) => ({ ...a, [c.status]: (a[c.status] ?? 0) + 1 }),
      {} as Record<Status, number>,
    );
    let newRunId: string | null = null;
    if (user?.id) {
      try {
        const { data: inserted } = await supabase.from("health_check_runs").insert({
          user_id: user.id,
          baseline: STAGEOS_VERSION,
          route: typeof window !== "undefined" ? window.location.pathname : null,
          user_agent: typeof navigator !== "undefined" ? navigator.userAgent : null,
          summary: summaryLocal as any,
          items: out as any,
          pass_count: summaryLocal.pass ?? 0,
          warn_count: summaryLocal.warn ?? 0,
          fail_count: summaryLocal.fail ?? 0,
          skip_count: summaryLocal.skip ?? 0,
        }).select("id").single();
        newRunId = (inserted as any)?.id ?? null;
        setLastRunId(newRunId);
        void loadRecent();
      } catch {
        /* non-fatal */
      }
    }

    setRunning(false);
  }

  const summary = checks.reduce(
    (a, c) => ({ ...a, [c.status]: (a[c.status] ?? 0) + 1 }),
    {} as Record<Status, number>
  );
  const failed = (summary.fail ?? 0) > 0;
  const done = checks.length > 0 && !running;

  function buildSummaryText(): string {
    const lines: string[] = [];
    lines.push("StageOS 一键验收摘要");
    lines.push(`baseline: ${STAGEOS_VERSION}`);
    lines.push(`route: ${typeof window !== "undefined" ? window.location.pathname : "-"}`);
    lines.push(`userAgent: ${typeof navigator !== "undefined" ? navigator.userAgent : "-"}`);
    lines.push(`时间: ${startedAt ?? new Date().toLocaleString()}`);
    lines.push(`登录状态: ${user?.email ?? user?.id ?? "未登录"}`);
    lines.push("");
    lines.push("检查项:");
    for (const c of checks) {
      lines.push(`- [${c.status.toUpperCase()}] ${c.label}${c.detail ? ` — ${c.detail}` : ""}`);
    }
    const pd = (checks as any).__providerDetail as
      | { providerMode: string; providerId: string; fallbackUsed: boolean; candidates: number; warningCode?: string }
      | null
      | undefined;
    if (pd) {
      lines.push("");
      lines.push("采购 provider 细节:");
      lines.push(`  providerMode: ${pd.providerMode}`);
      lines.push(`  providerId: ${pd.providerId}`);
      lines.push(`  fallbackUsed: ${pd.fallbackUsed}`);
      lines.push(`  candidates: ${pd.candidates}`);
      if (pd.warningCode) lines.push(`  warningCode: ${pd.warningCode}`);
    }
    const pdfd = (checks as any).__pdfDetail as
      | { status: Status; reason: string; detail: string }
      | null
      | undefined;
    if (pdfd) {
      lines.push("");
      lines.push("PDF 模块状态:");
      lines.push(`  status: ${pdfd.status}`);
      lines.push(`  reason: ${pdfd.reason}`);
      lines.push(`  detail: ${pdfd.detail}`);
    }
    // PDF 三态探针仅在 debug 面板展示，不进入验收摘要（避免同模块多状态冲突）


    lines.push("");
    lines.push(
      `汇总: pass=${summary.pass ?? 0} warn=${summary.warn ?? 0} fail=${summary.fail ?? 0} skip=${summary.skip ?? 0}`,
    );
    return lines.join("\n");
  }

  async function copySummary() {
    const text = buildSummaryText();
    try {
      await navigator.clipboard.writeText(text);
      toast.success("验收摘要已复制到剪贴板");
    } catch {
      toast.error("复制失败，请手动选择文本");
      // eslint-disable-next-line no-console
      console.log(text);
    }
  }

  function downloadSummaryTxt() {
    const text = "\uFEFF" + buildSummaryText();
    const blob = new Blob([text], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
    a.href = url;
    a.download = `stageos-acceptance-${stamp}.txt`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
  }

  async function toggleRelease(row: RunRow) {
    if (!user?.id) return;
    const next = !row.is_release;
    let note: string | null = row.release_note ?? null;
    if (next) {
      const input = typeof window !== "undefined"
        ? window.prompt("Release 备注（可留空）", row.baseline)
        : null;
      note = input ?? null;
    }
    const { error } = await supabase
      .from("health_check_runs")
      .update({ is_release: next, release_note: note, released_at: next ? new Date().toISOString() : null })
      .eq("id", row.id);
    if (error) { toast.error("锁定 release 失败：" + error.message); return; }
    toast.success(next ? "已锁定为 stable release" : "已取消 release 标记");
    void loadRecent();
  }

  function pickCompare(id: string) {
    setCompareIds(([a, b]) => {
      if (a === id) return [null, b];
      if (b === id) return [a, null];
      if (!a) return [id, b];
      if (!b) return [a, id];
      return [b, id]; // shift
    });
  }

  const compareRows: [RunRow | null, RunRow | null] = [
    recent.find((r) => r.id === compareIds[0]) ?? null,
    recent.find((r) => r.id === compareIds[1]) ?? null,
  ];

  return (
    <div className="panel">
      <div className="panel-header">
        <h2 className="text-sm font-semibold">一键验收 / 健康检查</h2>
        <span className="kbd-route">health</span>
      </div>
      <div className="panel-body space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <Button size="sm" onClick={run} disabled={running}>
            {running ? <><Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" />检查中…</> : "运行一键验收"}
          </Button>
          {startedAt && <span className="text-xs text-muted-foreground font-mono">{startedAt}</span>}
          {done && (
            <div className="flex items-center gap-1.5 ml-auto flex-wrap">
              <ToneBadge tone="success">pass {summary.pass ?? 0}</ToneBadge>
              {(summary.warn ?? 0) > 0 && <ToneBadge tone="warning">warn {summary.warn}</ToneBadge>}
              {(summary.fail ?? 0) > 0 && <ToneBadge tone="destructive">fail {summary.fail}</ToneBadge>}
              {(summary.skip ?? 0) > 0 && <ToneBadge tone="muted">skip {summary.skip}</ToneBadge>}
              <Button size="sm" variant="outline" onClick={copySummary} className="h-7">
                <Copy className="h-3.5 w-3.5 mr-1" />复制验收摘要
              </Button>
              <Button size="sm" variant="outline" onClick={downloadSummaryTxt} className="h-7">
                <DownloadIcon className="h-3.5 w-3.5 mr-1" />下载 .txt
              </Button>
            </div>
          )}
        </div>

        {done && (
          <div className={"rounded border px-2.5 py-1.5 text-xs " + (failed ? "border-destructive/40 bg-destructive/5 text-destructive" : "border-success/40 bg-success/5 text-success")}>
            {failed ? "存在失败项，请查看下方详情。" : "全部关键项通过，v2 基线正常。"}
          </div>
        )}

        <ul className="divide-y border rounded bg-surface">
          {checks.length === 0 && !running && (
            <li className="px-3 py-6 text-center text-xs text-muted-foreground">尚未运行。点击"运行一键验收"开始。</li>
          )}
          {checks.map((c) => (
            <li key={c.id} className="px-3 py-2 flex items-start gap-2 text-sm">
              <StatusIcon status={c.status} />
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-medium">{c.label}</span>
                  {typeof c.ms === "number" && <span className="text-[11px] text-muted-foreground font-mono">{c.ms}ms</span>}
                </div>
                {c.detail && <div className="text-[11px] text-muted-foreground font-mono break-all">{c.detail}</div>}
              </div>
              <StatusTag status={c.status} />
            </li>
          ))}
        </ul>

        {pdfProbes && (
          <div className="border rounded bg-surface">
            <div className="px-3 py-1.5 border-b flex items-center gap-2 text-xs text-muted-foreground">
              <AlertTriangle className="h-3.5 w-3.5" />
              <span>PDF 三态调试探针 (debug, 不计入验收结论)</span>
            </div>
            <ul className="divide-y text-xs">
              {(["disabled", "enabled", "error"] as const).map((k) => {
                const p = pdfProbes[k];
                return (
                  <li key={k} className="px-3 py-2 flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <div className="font-mono">{k}</div>
                      <div className="text-[11px] text-muted-foreground font-mono break-all">
                        {p.reason} — {p.detail}
                      </div>
                    </div>
                    <StatusTag status={p.status} />
                  </li>
                );
              })}
            </ul>
          </div>
        )}



        {lastRunId && (
          <div className="text-[11px] font-mono text-muted-foreground break-all">
            run_id: {lastRunId}
          </div>
        )}

        {recent.length > 0 && (
          <div className="border rounded bg-surface">
            <div className="px-3 py-1.5 border-b flex items-center gap-2 text-xs text-muted-foreground">
              <History className="h-3.5 w-3.5" />
              <span>最近 10 次验收记录 · 勾选两条对比</span>
            </div>
            <ul className="divide-y">
              {recent.map((r) => {
                const failed = (r.fail_count ?? 0) > 0;
                const warned = (r.warn_count ?? 0) > 0;
                const tone: "success" | "warning" | "destructive" = failed ? "destructive" : warned ? "warning" : "success";
                const label = failed ? "fail" : warned ? "warn" : "pass";
                const picked = compareIds[0] === r.id || compareIds[1] === r.id;
                return (
                  <li key={r.id} className="px-3 py-1.5 flex items-center gap-2 text-xs">
                    <input
                      type="checkbox"
                      className="h-3.5 w-3.5"
                      checked={picked}
                      onChange={() => pickCompare(r.id)}
                      aria-label="选择对比"
                    />
                    <ToneBadge tone={tone}>{label}</ToneBadge>
                    {r.is_release && <ToneBadge tone="success">release</ToneBadge>}
                    <span className="font-mono text-muted-foreground truncate">
                      {new Date(r.created_at).toLocaleString()}
                    </span>
                    <span className="font-mono text-[11px] text-muted-foreground/80 truncate hidden md:inline">
                      {r.baseline}
                    </span>
                    <span className="ml-auto font-mono text-[11px] text-muted-foreground shrink-0">
                      p{r.pass_count}/w{r.warn_count}/f{r.fail_count}/s{r.skip_count}
                    </span>
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-6 px-2 text-[11px]"
                      onClick={() => toggleRelease(r)}
                    >
                      {r.is_release ? "取消 release" : "锁定 release"}
                    </Button>
                  </li>
                );
              })}
            </ul>
          </div>
        )}

        {compareRows[0] && compareRows[1] && (
          <div className="border rounded bg-surface">
            <div className="px-3 py-1.5 border-b flex items-center gap-2 text-xs text-muted-foreground">
              <span>历史验收对比</span>
              <Button
                size="sm"
                variant="outline"
                className="h-6 px-2 text-[11px] ml-auto"
                onClick={() => setCompareIds([null, null])}
              >
                清除
              </Button>
            </div>
            <div className="p-3 grid grid-cols-3 gap-2 text-xs font-mono">
              <div className="text-muted-foreground">字段</div>
              <div className="truncate">A · {new Date(compareRows[0]!.created_at).toLocaleString()}</div>
              <div className="truncate">B · {new Date(compareRows[1]!.created_at).toLocaleString()}</div>

              {([
                ["baseline", compareRows[0]!.baseline, compareRows[1]!.baseline],
                ["pass", compareRows[0]!.pass_count, compareRows[1]!.pass_count],
                ["warn", compareRows[0]!.warn_count, compareRows[1]!.warn_count],
                ["fail", compareRows[0]!.fail_count, compareRows[1]!.fail_count],
                ["skip", compareRows[0]!.skip_count, compareRows[1]!.skip_count],
                ["release", compareRows[0]!.is_release ? "yes" : "no", compareRows[1]!.is_release ? "yes" : "no"],
              ] as const).map(([k, a, b]) => {
                const diff = String(a) !== String(b);
                return (
                  <>
                    <div key={`${k}-k`} className="text-muted-foreground">{k}</div>
                    <div key={`${k}-a`} className={diff ? "text-warning" : ""}>{String(a)}</div>
                    <div key={`${k}-b`} className={diff ? "text-warning" : ""}>{String(b)}</div>
                  </>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function StatusIcon({ status }: { status: Status }) {
  if (status === "pass") return <CheckCircle2 className="h-4 w-4 text-success shrink-0 mt-0.5" />;
  if (status === "fail") return <XCircle className="h-4 w-4 text-destructive shrink-0 mt-0.5" />;
  if (status === "warn") return <AlertTriangle className="h-4 w-4 text-warning shrink-0 mt-0.5" />;
  return <span className="h-4 w-4 shrink-0 mt-0.5 rounded-full border border-muted-foreground/40" />;
}

function StatusTag({ status }: { status: Status }) {
  const map: Record<Status, "success" | "destructive" | "warning" | "muted"> = {
    pass: "success", fail: "destructive", warn: "warning", skip: "muted",
  };
  return <ToneBadge tone={map[status]}>{status}</ToneBadge>;
}
