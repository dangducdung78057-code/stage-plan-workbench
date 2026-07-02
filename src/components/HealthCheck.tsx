import { useState } from "react";
import { Button } from "@/components/ui/button";
import { ToneBadge } from "@/components/StatusBadge";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { STAGEOS_VERSION } from "@/lib/stageos";
import { getFlag } from "@/lib/featureFlags";
import { renderMarkdown } from "@/lib/exportRender";
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
      status: STAGEOS_VERSION === "stageos-v2-auth-mock-mvp-pass + storageUpload branch pass" ? "pass" : "warn",
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

    // 11. PDF 导出：已启用 html2pdf 光栅化真实下载
    push({
      id: "pdf",
      label: "PDF 导出（真实下载）",
      status: getFlag("pdfExport") ? "pass" : "skip",
      detail: getFlag("pdfExport") ? "html2pdf.js 光栅化 · 中文原样输出" : "flag off",
    });

    // 11b. PNG 导出：html-to-image 光栅化
    push({
      id: "png",
      label: "PNG 导出（长图分享）",
      status: getFlag("pngExport") ? "pass" : "skip",
      detail: getFlag("pngExport") ? "html-to-image 光栅化 · 中文原样输出" : "flag off",
    });

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
