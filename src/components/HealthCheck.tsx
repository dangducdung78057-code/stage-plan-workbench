import { useState } from "react";
import { Button } from "@/components/ui/button";
import { ToneBadge } from "@/components/StatusBadge";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { STAGEOS_VERSION } from "@/lib/stageos";
import { getFlag } from "@/lib/featureFlags";
import { renderMarkdown, renderPrintableHtml, renderPdfBlob, renderPngBlob, validatePrintableHtml, validatePrintableContent } from "@/lib/exportRender";
import { CheckCircle2, XCircle, Loader2, AlertTriangle } from "lucide-react";

type Status = "pass" | "fail" | "warn" | "skip";
type Check = { id: string; label: string; status: Status; detail?: string; ms?: number };

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

  async function run() {
    setRunning(true);
    setChecks([]);
    setStartedAt(new Date().toLocaleString());
    const out: Check[] = [];
    const push = (c: Check) => { out.push(c); setChecks([...out]); };

    // 1. version tag
    push({
      id: "version",
      label: "版本标记 (STAGEOS_VERSION)",
      status: STAGEOS_VERSION === "stageos-v2.2-export-suite-pass" ? "pass" : "warn",
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
      else push({ id: "settings", label: "全局设置读取", status: "pass", detail: `apiMode=${(result.data as any)?.api_mode ?? "mock"}`, ms });
    } catch (e: any) {
      push({ id: "settings", label: "全局设置读取", status: "fail", detail: e?.message });
    }

    // 9. Edge Function plan-precheck 可达性（业务拒绝也算可达）
    try {
      const { result, ms } = await timed(async () => await (
        supabase.functions.invoke("plan-precheck", { body: { projectId: "__healthcheck__" } }))
      );
      push({
        id: "edge",
        label: "Edge Function plan-precheck",
        status: "pass",
        detail: result.error ? `可达 (业务拒绝: ${String(result.error.message ?? "").slice(0, 60)})` : "可达",
        ms,
      });
    } catch (e: any) {
      push({ id: "edge", label: "Edge Function plan-precheck", status: "fail", detail: e?.message });
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

    // 11. PDF 导出：flag off 时 skip；开启时必须 HTML 校验通过且生成非空 blob
    if (!getFlag("pdfExport")) {
      push({ id: "pdf", label: "PDF 导出（实验版）", status: "skip", detail: "flag off" });
    } else if (!validatePrintableHtml(sampleHtml)) {
      push({ id: "pdf", label: "PDF 导出（实验版）", status: "fail", detail: "printable html invalid" });
    } else {
      try {
        const { result, ms } = await timed(async () => await renderPdfBlob(sampleHtml));
        push({
          id: "pdf",
          label: "PDF 导出（实验版）",
          status: result && result.size > 1024 ? "pass" : "fail",
          detail: `bytes=${result?.size ?? 0}`,
          ms,
        });
      } catch (e: any) {
        push({ id: "pdf", label: "PDF 导出（实验版）", status: "fail", detail: e?.message });
      }
    }

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
          supabase.functions.invoke("ai-generate-plan", { body: { projectId: "__healthcheck__" } }))
        );
        const data: any = result.data;
        const code: string | undefined = data?.code;
        const reachableCodes = new Set(["UNAUTHORIZED", "FORBIDDEN", "CONFIRMATION_REQUIRED", "VALIDATION_REQUIRED", "BAD_REQUEST"]);
        if (code && reachableCodes.has(code)) {
          push({ id: "ai", label: "AI provider (ai-generate-plan)", status: "pass", detail: `可达 (业务拒绝: ${code})`, ms });
        } else if (code && code.startsWith("AI_")) {
          push({ id: "ai", label: "AI provider (ai-generate-plan)", status: "warn", detail: `AI 不可用，将 fallback mock (${code})`, ms });
        } else if (data?.ok) {
          push({ id: "ai", label: "AI provider (ai-generate-plan)", status: "pass", detail: "AI 可达", ms });
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
    if (!getFlag("procurement")) {
      push({ id: "procurement", label: "采购候选商品 v1 (本地目录)", status: "skip", detail: "flag off" });
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
              label: "采购候选商品 v1 (本地目录)",
              status: ok ? "pass" : "warn",
              detail: ok ? `entries=${PROCUREMENT_CATALOG.length}, sample=${sample.length}` : "候选字段缺失",
            });
          }
        }
      } catch (e: any) {
        push({ id: "procurement", label: "采购候选商品 v1 (本地目录)", status: "warn", detail: `匹配异常: ${e?.message ?? "unknown"}` });
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
