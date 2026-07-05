import { useEffect, useMemo, useState } from "react";
import { useParams, Link, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { StatusBadge, ToneBadge } from "@/components/StatusBadge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  validateStageInput, validateStageInputDetailed, appendValidationHistory,
  type StageInputData, PROGRAM_TYPES, SCHOOL_STAGES, CONFIRMATION_STATUSES,
} from "@/lib/stageos";
import { generateMockPlan } from "@/lib/mockPlan";
import { getFlag, useFlags } from "@/lib/featureFlags";
import { toast } from "sonner";
import {
  ArrowLeft, Sparkles, FileJson, FileText, CheckCircle2, AlertTriangle,
  ExternalLink, Image as ImageIcon, Video, Layers as LayersIcon, Wand2,
} from "lucide-react";
import { MobileCard, MobileCardList, MobileField } from "@/components/MobileCard";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { renderMarkdown } from "@/lib/exportRender";
import { ProcurementCandidatesToggle, ProcurementDisclaimer } from "@/components/ProcurementCandidatesRow";
import type { MatchContext } from "@/lib/procurementMatch";
import { useProcurementSettings } from "@/lib/procurementSettings";
import { dispatchWebhook } from "@/lib/webhook";

type Project = { id: string; title: string; status: string; performance_date: string | null; performer_count: number | null; updated_at: string };
type Snapshot = {
  id: string; project_id: string; version: number; mode: string;
  costume_plan: any; risks: any; reverse_schedule: any; platform_search: any;
  generated_at: string;
};
type Confirmation = { id: string; status: string; notes: string | null; confirmed_at: string | null; created_at: string; snapshot_id: string | null };
type PrecheckResult = {
  ok: boolean;
  code?: string;
  errorCode?: string;
  message?: string;
  issues?: string[];
};

// Map a validation message to the offending StageInputData field (best-effort, keyword-based).
function locateValidationField(msg: string): { field: string; label: string } | null {
  const rules: Array<{ re: RegExp; field: string; label: string }> = [
    { re: /performerCount|总人数/, field: "performerCount", label: "总人数" },
    { re: /maleCount|男生数|男\(/, field: "maleCount", label: "男生数" },
    { re: /femaleCount|女生数|女\(/, field: "femaleCount", label: "女生数" },
    { re: /人均预算|perPersonBudget/, field: "perPersonBudget", label: "人均预算" },
    { re: /彩排频次|rehearsalFrequency/, field: "rehearsalFrequencyPerWeek", label: "彩排频次" },
    { re: /studentId/, field: "students.studentId", label: "学生编号" },
    { re: /heightCm/, field: "students.heightCm", label: "身高" },
    { re: /性别分布|gender/, field: "students.gender", label: "学生性别" },
    { re: /学生行数/, field: "students", label: "学生名单" },
  ];
  for (const r of rules) if (r.re.test(msg)) return { field: r.field, label: r.label };
  return null;
}


export default function ProjectDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [project, setProject] = useState<Project | null>(null);
  const [input, setInput] = useState<StageInputData | null>(null);
  const [snapshots, setSnapshots] = useState<Snapshot[]>([]);
  const [confirmations, setConfirmations] = useState<Confirmation[]>([]);
  const [notes, setNotes] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [generationNotice, setGenerationNotice] = useState<PrecheckResult | null>(null);
  const [confirmPreview, setConfirmPreview] = useState<{
    errors: string[]; warnings: string[]; checkedAt: string;
    snapshot: StageInputData;
  } | null>(null);
  const flags = useFlags();
  const aiOn = flags.aiProvider;
  const procurementSettings = useProcurementSettings();

  const latest = snapshots[0];
  const latestConfirm = confirmations[0];
  const issues = input ? validateStageInput(input) : [];

  async function load() {
    if (!id) return;
    setLoading(true);
    const [{ data: p }, { data: si }, { data: ss }, { data: cs }] = await Promise.all([
      supabase.from("projects").select("*").eq("id", id).maybeSingle(),
      supabase.from("stage_inputs").select("data").eq("project_id", id).maybeSingle(),
      supabase.from("plan_snapshots").select("*").eq("project_id", id).order("version", { ascending: false }),
      supabase.from("confirmation_records").select("*").eq("project_id", id).order("created_at", { ascending: false }),
    ]);
    setProject(p as any);
    setInput((si?.data as StageInputData) ?? null);
    setSnapshots((ss as Snapshot[]) ?? []);
    setConfirmations((cs as Confirmation[]) ?? []);
    setLoading(false);
  }

  useEffect(() => { load(); }, [id]);

  // 从编辑页「返回确认」跳回时(?confirm=1),自动重新打开校验预览弹窗。
  useEffect(() => {
    if (!project) return;
    const params = new URLSearchParams(window.location.search);
    if (params.get("confirm") !== "1") return;
    (async () => {
      const { data: siRow } = await supabase
        .from("stage_inputs").select("data").eq("project_id", project.id).maybeSingle();
      const fresh = (siRow?.data ?? input ?? {}) as StageInputData;
      const { errors, warnings } = validateStageInputDetailed(fresh);
      setConfirmPreview({ errors, warnings, checkedAt: new Date().toISOString(), snapshot: fresh });
      const delta = errors.length + warnings.length;
      if (delta === 0) toast.success("校验已通过,可继续确认。");
      else toast.info(`重新校验:${errors.length} 错误 / ${warnings.length} 提示`);
      // 清掉 query 参数,避免刷新反复弹出。
      params.delete("confirm");
      const qs = params.toString();
      window.history.replaceState({}, "", `${window.location.pathname}${qs ? `?${qs}` : ""}`);
    })();
  }, [project?.id]);

  const hasPrivacyConfirmation = confirmations.some((c) => c.status === "confirmed");

  async function handleGenerate() {
    if (!input || !project) return;
    setBusy(true);
    setGenerationNotice(null);
    try {
      // Precheck order: auth -> permission -> confirmation -> validation.
      // Backend enforces the same order via the plan-precheck edge function.
      // Business rejections may be non-2xx; parse their JSON body and return it to the UI.
      let pre: PrecheckResult | null = null;
      try {
        const res = await supabase.functions.invoke("plan-precheck", {
          body: { projectId: project.id },
        });
        pre = res.data;
        // Non-2xx function responses are represented as errors by the client.
        // They are still business responses when the body contains { ok:false, code, message }.
        if (res.error && !pre) {
          const ctx: any = (res.error as any)?.context;
          if (ctx && typeof ctx.clone === "function" && typeof ctx.json === "function") {
            try { pre = await ctx.clone().json(); } catch { /* ignore */ }
          } else if (ctx && typeof ctx.json === "function") {
            try { pre = await ctx.json(); } catch { /* ignore */ }
          }
          if (!pre) pre = { ok: false, code: "INTERNAL", message: res.error.message };
        }
      } catch (netErr: any) {
        pre = { ok: false, code: "INTERNAL", message: netErr?.message ?? "network error" };
      }

      // Edge Function 不可达（未部署/网络失败）时，用客户端等价校验回退，保证主流程不被阻断。
      // 顺序与后端一致：auth -> confirmation -> validation。
      if (!pre?.ok && (pre?.code ?? "INTERNAL") === "INTERNAL") {
        const { data: userData } = await supabase.auth.getUser();
        if (!userData.user) {
          pre = { ok: false, code: "UNAUTHORIZED", message: "not signed in" };
        } else if (!hasPrivacyConfirmation) {
          pre = { ok: false, code: "CONFIRMATION_REQUIRED", message: "confirmation required" };
        } else {
          const { errors } = validateStageInputDetailed(input);
          pre = errors.length > 0
            ? { ok: false, code: "VALIDATION_REQUIRED", message: "validation required", issues: errors }
            : { ok: true };
        }
      }

      if (!pre?.ok) {
        const errorCode = pre?.code ?? pre?.errorCode ?? "INTERNAL";
        const notice = { ...pre, code: errorCode };
        setGenerationNotice(notice);
        if (errorCode === "UNAUTHORIZED") {
          toast.error("请先登录后再生成排产。");
        } else if (errorCode === "FORBIDDEN") {
          toast.error("无权访问该项目。");
        } else if (errorCode === "CONFIRMATION_REQUIRED") {
          toast.warning("请先完成用户确认/隐私确认后再生成排产。");
        } else if (errorCode === "VALIDATION_REQUIRED") {
          toast.warning("请先解决数据校验提示，再生成排产。", {
            description: pre?.issues?.length ? pre.issues.join("\n") : undefined,
          });
        } else {
          toast.error("生成前置校验失败:" + (pre?.message ?? errorCode));
        }
        return;
      }

      // AI 生成 provider（feature flag，任何失败必须自动回退到 mock，绝不抛 Runtime Error）
      let costumePlan: any, risks: any, reverseSchedule: any, platformSearch: any;
      let mode: "ai" | "mock" = "mock";
      let providerStatus: string | null = null;
      const useAi = getFlag("aiProvider");
      const validateAiPlan = (p: any): string[] => {
        const miss: string[] = [];
        if (!p || typeof p !== "object") return ["plan"];
        const cp = p.costumePlan;
        if (!cp) miss.push("costumePlan");
        else {
          if (!Array.isArray(cp.femalePlan) || cp.femalePlan.length === 0) miss.push("女生方案");
          if (!Array.isArray(cp.malePlan) || cp.malePlan.length === 0) miss.push("男生方案");
          if (!Array.isArray(cp.accessories) || cp.accessories.length === 0) miss.push("配饰");
        }
        if (!Array.isArray(p.risks) || p.risks.length === 0) miss.push("风险");
        if (!Array.isArray(p.reverseSchedule) || p.reverseSchedule.length === 0) miss.push("倒排");
        if (!Array.isArray(p.platformSearch) || p.platformSearch.length === 0) miss.push("采购建议");
        return miss;
      };
      if (useAi) {
        try {
          const res = await supabase.functions.invoke("ai-generate-plan", { body: { projectId: project.id } });
          const data: any = res.data;
          if (data?.ok && data.plan) {
            const miss = validateAiPlan(data.plan);
            if (miss.length === 0) {
              costumePlan = data.plan.costumePlan;
              risks = data.plan.risks;
              reverseSchedule = data.plan.reverseSchedule;
              platformSearch = data.plan.platformSearch;
              mode = "ai";
              providerStatus = "ai";
            } else {
              toast.warning("AI provider 不可用，已使用 mock fallback。", { description: `缺少字段：${miss.join("、")}` });
              providerStatus = "fallback";
            }
          } else {
            toast.warning("AI provider 不可用，已使用 mock fallback。", {
              description: data?.code ?? res.error?.message ?? "AI 返回异常",
            });
            providerStatus = "fallback";
          }
        } catch (aiErr: any) {
          toast.warning("AI provider 不可用，已使用 mock fallback。", { description: aiErr?.message });
          providerStatus = "fallback";
        }
      }
      if (mode === "mock") {
        const mocked = generateMockPlan(input);
        costumePlan = mocked.costumePlan;
        risks = mocked.risks;
        reverseSchedule = mocked.reverseSchedule;
        platformSearch = mocked.platformSearch;
      }
      const nextVersion = (snapshots[0]?.version ?? 0) + 1;
      const { data: userData } = await supabase.auth.getUser();
      const uid = userData.user?.id;
      const { error } = await supabase.from("plan_snapshots").insert({
        project_id: project.id, user_id: uid, version: nextVersion, mode,
        provider_status: providerStatus,
        costume_plan: costumePlan as any, risks: risks as any,
        reverse_schedule: reverseSchedule as any, platform_search: platformSearch as any,
      } as any);
      if (error) throw error;
      await supabase.from("projects").update({ status: "planning" }).eq("id", project.id);
      const label = mode === "ai" ? "AI" : providerStatus === "fallback" ? "mock (fallback)" : "mock";
      toast.success(`已生成 v${nextVersion} 服装总表(${label})`);
      setGenerationNotice(null);
      load();
    } catch (e: any) { toast.error("生成失败:" + e.message); }
    finally { setBusy(false); }
  }

  async function handleConfirm(newStatus: "draft" | "needs_revision" | "confirmed") {
    if (!project) return;
    setBusy(true);
    try {
      const { data: userData } = await supabase.auth.getUser();
      const uid = userData.user?.id;

      // 确认前强制再校验:以数据库中最新 stage_inputs.data 为准,重跑 validateStageInputDetailed,
      // 结果无论通过与否都会写入 __validationHistory,便于回溯"是否曾在校验失败时确认"。
      const { data: siRow } = await supabase
        .from("stage_inputs").select("data").eq("project_id", project.id).maybeSingle();
      const fresh = (siRow?.data ?? input ?? {}) as StageInputData;
      const { errors: vErrors, warnings: vWarnings } = validateStageInputDetailed(fresh);
      const persisted = appendValidationHistory(fresh as never, {
        checkedAt: new Date().toISOString(),
        errors: vErrors,
        warnings: vWarnings,
      });
      await supabase.from("stage_inputs").upsert({
        project_id: project.id, user_id: uid, data: persisted as any,
      } as any);

      if (newStatus === "confirmed" && vErrors.length > 0) {
        toast.error(`存在 ${vErrors.length} 项校验错误,无法确认。请先修正。`, {
          description: vErrors.join("\n"),
        });
        setBusy(false);
        load();
        return;
      }

      // Privacy/user confirmation can be recorded before a snapshot exists;
      // snapshot-level confirmation attaches the latest snapshot when available.
      await supabase.from("confirmation_records").insert({
        project_id: project.id, user_id: uid, snapshot_id: latest?.id ?? null,
        status: newStatus, notes: notes || null,
        confirmed_at: newStatus === "confirmed" ? new Date().toISOString() : null,
      } as any);
      const projectStatus = newStatus === "confirmed" ? "confirmed" : newStatus === "needs_revision" ? "needs_revision" : "planning";
      await supabase.from("projects").update({ status: projectStatus }).eq("id", project.id);
      toast.success("已更新确认状态" + (vWarnings.length ? ` · ${vWarnings.length} 项提示` : ""));
      setNotes("");
      load();
    } catch (e: any) { toast.error(e.message); }
    finally { setBusy(false); }
  }


  async function handleExport(format: "json" | "markdown") {
    if (!project || !latest) return;
    setBusy(true);
    try {
      const payload = buildExportPayload(project, input, latest);
      const { data: userData } = await supabase.auth.getUser();
      const uid = userData.user?.id;
      await supabase.from("export_records").insert({
        project_id: project.id, user_id: uid, snapshot_id: latest.id,
        version: latest.version, format, payload: JSON.stringify(payload),
      } as any);
      await supabase.from("projects").update({ status: "exported" }).eq("id", project.id);
      const isJson = format === "json";
      const mime = isJson ? "application/json;charset=utf-8" : "text/markdown;charset=utf-8";
      const markdown = isJson ? "" : renderMarkdown(payload, "json", {
        projectTitle: project.title,
        version: latest.version,
        createdAt: new Date().toLocaleString("zh-CN", { hour12: false }),
      });
      if (!isJson) {
        console.info("[StageOS Markdown Debug] project.title", project.title);
        console.info("[StageOS Markdown Debug] snapshot.project.title", payload.snapshot.project.title ?? payload.project.title);
        console.info("[StageOS Markdown Debug] renderMarkdown.firstLine", markdown.split(/\r?\n/, 1)[0]?.replace(/^#\s*/, ""));
      }
      const body = isJson ? JSON.stringify(payload, null, 2) : (markdown.startsWith("\uFEFF") ? markdown : "\uFEFF" + markdown);
      const blob = new Blob([body], { type: mime });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url; a.download = `${project.title}-v${latest.version}.${isJson ? "json" : "md"}`;
      a.click(); URL.revokeObjectURL(url);
      toast.success(`已导出 ${format.toUpperCase()}`);
      dispatchWebhook("export.created", {
        project_id: project.id,
        summary: { format, version: latest.version, snapshot_id: latest.id, bytes: blob.size },
      });
      load();
    } catch (e: any) { toast.error(e.message); }
    finally { setBusy(false); }
  }

  if (loading) return <div className="p-6 text-muted-foreground text-sm">加载中…</div>;
  if (!project) return <div className="p-6 text-muted-foreground text-sm">项目不存在</div>;

  const isConfirmed = project.status === "confirmed" || project.status === "exported";
  const programLabel = PROGRAM_TYPES.find((p) => p.value === input?.programType)?.label ?? "—";
  const stageLabel = SCHOOL_STAGES.find((s) => s.value === input?.schoolStage)?.label ?? "—";

  return (
    <div className="p-4 md:p-6 space-y-4 max-w-6xl min-w-0">
      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div className="min-w-0 flex-1">
          <div className="mb-1">
            <Button asChild variant="ghost" size="sm" className="-ml-2 mb-1 md:mb-0 md:mr-1"><Link to="/projects"><ArrowLeft className="h-4 w-4 mr-1" />返回</Link></Button>
          </div>
          <div className="flex flex-wrap items-center gap-2 mb-1 min-w-0">
            <h1 className="text-lg md:text-xl font-semibold break-words leading-snug min-w-0 flex-1">{project.title}</h1>
            <StatusBadge status={project.status} className="shrink-0" />
          </div>
          <div className="text-xs text-muted-foreground font-mono break-all">
            id: {project.id.slice(0, 8)} · 更新 {new Date(project.updated_at).toLocaleString("zh-CN", { hour12: false })}
          </div>
        </div>
        <div className="flex flex-col gap-2 w-full md:flex-row md:w-auto md:items-center md:shrink-0">
          <Button asChild variant="outline" size="sm" className="w-full md:w-auto justify-center"><Link to={`/projects/${id}/edit`}>编辑输入</Link></Button>
          <Button
            size="sm"
            onClick={handleGenerate}
            disabled={busy}
            title={hasPrivacyConfirmation ? (aiOn ? "生成 AI 排产（失败回退 mock）" : "生成 Mock 排产") : "请先完成用户/隐私确认"}
            className="w-full md:w-auto justify-center"
          >
            <Sparkles className="h-4 w-4 mr-1" />{aiOn ? "生成 AI 排产" : "生成 Mock 排产"}
            {aiOn && <span className="ml-2 kbd-route whitespace-nowrap">AI</span>}
            {!hasPrivacyConfirmation && <span className="ml-2 kbd-route whitespace-nowrap">需确认</span>}
          </Button>
        </div>
      </div>

      {!hasPrivacyConfirmation && (
        <div className="panel border-warning/40 bg-warning/5 panel-body flex items-start gap-2 text-sm">
          <AlertTriangle className="h-4 w-4 text-warning mt-0.5" />
          <div>
            <div className="font-medium text-warning">尚未完成用户/隐私确认</div>
            <div className="mt-1 text-muted-foreground text-xs">
              请先在「确认 <span className="kbd-route">/confirm</span>」标签页完成确认后再生成排产。错误码:<span className="font-mono">CONFIRMATION_REQUIRED</span>
            </div>
          </div>
        </div>
      )}

      {generationNotice && !generationNotice.ok && (
        <div className="panel border-warning/40 bg-warning/5 panel-body flex items-start gap-2 text-sm">
          <AlertTriangle className="h-4 w-4 text-warning mt-0.5" />
          <div className="min-w-0">
            <div className="font-medium text-warning">
              {generationNotice.code === "CONFIRMATION_REQUIRED"
                ? "请先完成用户确认/隐私确认后再生成排产。"
                : generationNotice.code === "VALIDATION_REQUIRED"
                  ? "请先解决数据校验提示，再生成排产。"
                  : generationNotice.message ?? "生成前置校验未通过"}
            </div>
            {generationNotice.issues && generationNotice.issues.length > 0 && (
              <ul className="mt-1 list-disc list-inside text-muted-foreground text-xs space-y-0.5">
                {generationNotice.issues.map((issue) => <li key={issue}>{issue}</li>)}
              </ul>
            )}
          </div>
        </div>
      )}

      {issues.length > 0 && (
        <div className="panel border-warning/40 bg-warning/5 panel-body flex items-start gap-2 text-sm">
          <AlertTriangle className="h-4 w-4 text-warning mt-0.5" />
          <div>
            <div className="font-medium text-warning">数据校验提示</div>
            <ul className="mt-1 list-disc list-inside text-muted-foreground text-xs space-y-0.5">
              {issues.map((i) => <li key={i}>{i}</li>)}
            </ul>
          </div>
        </div>
      )}

      <ValidationHistoryPanel input={input} />



      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <MetaCard label="学段" value={stageLabel} />
        <MetaCard label="节目类型" value={programLabel} mono={input?.programType} />
        <MetaCard label="总人数 / 男 / 女" value={`${input?.performerCount ?? "—"} / ${input?.maleCount ?? "—"} / ${input?.femaleCount ?? "—"}`} />
        <MetaCard label="演出日期" value={project.performance_date ?? "—"} mono />
      </div>

      <Tabs defaultValue="plan">
        <div className="overflow-x-auto -mx-4 px-4 md:mx-0 md:px-0">
          <TabsList className="w-max">
            <TabsTrigger value="plan" className="whitespace-nowrap">服装总表工作区</TabsTrigger>
            <TabsTrigger value="confirm" className="whitespace-nowrap">确认 <span className="kbd-route ml-1">/confirm</span></TabsTrigger>
            <TabsTrigger value="export" className="whitespace-nowrap">导出 <span className="kbd-route ml-1">/export</span></TabsTrigger>
            <TabsTrigger value="render" className="whitespace-nowrap">渲染上下文 <span className="kbd-route ml-1">/render-context</span></TabsTrigger>
          </TabsList>
        </div>

        <TabsContent value="plan" className="space-y-4 mt-4">
          <h2 className="sr-only">服装总表工作区</h2>
          {!latest && (
            <div className="panel panel-body text-sm text-muted-foreground text-center py-10">
              尚未生成排产。点击右上角 <b>生成 Mock 排产</b>。<br />
              <span className="text-xs">流程:compile-prompt → costume-master-plan → gated-output → confirm → export</span>
            </div>
          )}
          {latest && <PlanView snapshot={latest} ctx={{ programType: input?.programType, schoolStage: input?.schoolStage }} procurementOn={procurementSettings.procurementCandidatesEnabled} />}
          {snapshots.length > 1 && (
            <div className="panel">
              <div className="panel-header"><h2 className="text-sm font-semibold">历史快照</h2></div>
              <div className="hidden md:block">
                <table className="ops-table">
                  <thead><tr><th>版本</th><th>模式</th><th>生成时间</th><th>合计</th></tr></thead>
                  <tbody>
                    {snapshots.map((s) => (
                      <tr key={s.id}>
                        <td className="font-mono">v{s.version}</td>
                        <td><ToneBadge tone="info">{s.mode}</ToneBadge></td>
                        <td className="font-mono text-xs text-muted-foreground">{new Date(s.generated_at).toLocaleString("zh-CN", { hour12: false })}</td>
                        <td className="font-mono">¥ {s.costume_plan?.totalEstimate ?? "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <MobileCardList>
                {snapshots.map((s) => (
                  <MobileCard key={s.id} title={<span className="font-mono">v{s.version}</span>} right={<ToneBadge tone="info">{s.mode}</ToneBadge>}>
                    <MobileField label="生成时间" value={new Date(s.generated_at).toLocaleString("zh-CN", { hour12: false })} mono />
                    <MobileField label="合计" value={`¥ ${s.costume_plan?.totalEstimate ?? "—"}`} mono />
                  </MobileCard>
                ))}
              </MobileCardList>
            </div>
          )}
        </TabsContent>

        <TabsContent value="confirm" className="space-y-4 mt-4">
          <h2 className="sr-only">用户确认</h2>
          <div className="panel">
            <div className="panel-header">
              <h3 className="text-sm font-semibold">用户确认</h3>
              <span className="text-xs text-muted-foreground">
                当前:{latestConfirm ? CONFIRMATION_STATUSES.find((c) => c.value === latestConfirm.status)?.label : "草稿"}
              </span>
            </div>
            <div className="panel-body space-y-3">
              <div className="text-xs text-muted-foreground">
                用户/隐私确认为生成排产的前置条件。未完成确认前无法生成 Mock 排产。
              </div>
              <Textarea rows={3} placeholder="填写确认/修订备注(可选)…" value={notes} onChange={(e) => setNotes(e.target.value)} />
              <div className="flex gap-2 flex-wrap">
                <Button variant="outline" size="sm" onClick={() => handleConfirm("draft")} disabled={busy}>标记为草稿</Button>
                <Button variant="outline" size="sm" onClick={() => handleConfirm("needs_revision")} disabled={busy}>
                  <AlertTriangle className="h-4 w-4 mr-1" />需要修订
                </Button>
                <Button size="sm" onClick={async () => {
                  if (!project) return;
                  const { data: siRow } = await supabase
                    .from("stage_inputs").select("data").eq("project_id", project.id).maybeSingle();
                  const fresh = (siRow?.data ?? input ?? {}) as StageInputData;
                  const { errors, warnings } = validateStageInputDetailed(fresh);
                  setConfirmPreview({ errors, warnings, checkedAt: new Date().toISOString(), snapshot: fresh });
                }} disabled={busy}>
                  <CheckCircle2 className="h-4 w-4 mr-1" />确认(隐私/用户)
                </Button>
              </div>
              {confirmations.length > 0 && (
                <div>
                  <div className="text-xs text-muted-foreground mb-1">历史记录</div>
                  <div className="hidden md:block">
                    <table className="ops-table">
                      <thead><tr><th>状态</th><th>备注</th><th>时间</th></tr></thead>
                      <tbody>
                        {confirmations.map((c) => (
                          <tr key={c.id}>
                            <td><StatusBadge status={c.status} /></td>
                            <td className="text-xs">{c.notes ?? "—"}</td>
                            <td className="font-mono text-xs text-muted-foreground">
                              {new Date(c.confirmed_at ?? c.created_at).toLocaleString("zh-CN", { hour12: false })}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <MobileCardList>
                    {confirmations.map((c) => (
                      <MobileCard key={c.id} title={<StatusBadge status={c.status} />}>
                        <MobileField label="备注" value={c.notes ?? "—"} stack />
                        <MobileField label="时间" value={new Date(c.confirmed_at ?? c.created_at).toLocaleString("zh-CN", { hour12: false })} mono />
                      </MobileCard>
                    ))}
                  </MobileCardList>
                </div>
              )}
            </div>
          </div>
        </TabsContent>

        <TabsContent value="export" className="space-y-4 mt-4">
          <h2 className="sr-only">导出</h2>
          <div className="panel">
            <div className="panel-header">
              <h3 className="text-sm font-semibold">导出</h3>
              <span className="kbd-route">POST /export</span>
            </div>
            <div className="panel-body space-y-3">
              <div className="text-sm text-muted-foreground">
                导出当前最新快照 {latest ? `v${latest.version}` : "(暂无)"}。JSON 用于系统集成,Markdown 用于文档留存。
              </div>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" onClick={() => handleExport("json")} disabled={!latest || busy}>
                  <FileJson className="h-4 w-4 mr-1" />导出 JSON
                </Button>
                <Button variant="outline" size="sm" onClick={() => handleExport("markdown")} disabled={!latest || busy}>
                  <FileText className="h-4 w-4 mr-1" />导出 Markdown
                </Button>
                <Button variant="ghost" size="sm" onClick={() => navigate("/exports")}>查看全部导出记录 →</Button>
              </div>
            </div>
          </div>
        </TabsContent>

        <TabsContent value="render" className="space-y-4 mt-4">
          <h2 className="sr-only">渲染上下文</h2>
          <div className="panel">
            <div className="panel-header">
              <h3 className="text-sm font-semibold">渲染上下文预览(未来集成)</h3>
              <ToneBadge tone={isConfirmed ? "success" : "muted"}>
                {isConfirmed ? "已解锁" : "确认后解锁"}
              </ToneBadge>
            </div>
            <div className="panel-body">
              {!isConfirmed && (
                <div className="text-sm text-muted-foreground text-center py-8">
                  仅在项目状态为「已确认」时展示占位卡片。视觉/图片/视频模块为未来集成。
                </div>
              )}
              {isConfirmed && (
                <div className="grid grid-cols-3 gap-3">
                  <PlaceholderCard icon={<LayersIcon />} title="蓝图与 2D 预览" route="/api/stageos/blueprint-plan" />
                  <PlaceholderCard icon={<Wand2 />} title="3D 人台" route="/api/stageos/3d-mannequin" />
                  <PlaceholderCard icon={<ImageIcon />} title="图片渲染" route="/api/stageos/render-photo-v2" />
                  <PlaceholderCard icon={<Video />} title="15s 视频" route="/api/stageos/render-video-15s" />
                  <PlaceholderCard icon={<Sparkles />} title="综合渲染预览" route="/api/stageos/render-preview" />
                  <PlaceholderCard icon={<ExternalLink />} title="配色 RAG" route="/api/stageos/color-rag" />
                </div>
              )}
            </div>
          </div>
        </TabsContent>
      </Tabs>

      <AlertDialog open={!!confirmPreview} onOpenChange={(o) => !o && setConfirmPreview(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>确认前校验预览</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-3 text-sm">
                <div className="text-xs text-muted-foreground">
                  校验时间:<span className="font-mono">{confirmPreview?.checkedAt}</span>
                </div>

                {confirmPreview && (
                  <div className="rounded border border-border bg-muted/30 p-2 space-y-1">
                    <div className="text-xs font-medium text-muted-foreground">解密后待确认数据</div>
                    <dl className="grid grid-cols-2 gap-x-3 gap-y-1 text-xs">
                      {[
                        ["学段", confirmPreview.snapshot.schoolStage],
                        ["节目类型", confirmPreview.snapshot.programType],
                        ["节目主题", confirmPreview.snapshot.programTheme],
                        ["场地类型", confirmPreview.snapshot.venueType],
                        ["演出人数", confirmPreview.snapshot.performerCount],
                        ["男/女", (confirmPreview.snapshot.maleCount ?? "-") + " / " + (confirmPreview.snapshot.femaleCount ?? "-")],
                        ["人均预算", confirmPreview.snapshot.perPersonBudget],
                        ["演出日期", confirmPreview.snapshot.performanceDate],
                        ["排练频率/周", confirmPreview.snapshot.rehearsalFrequencyPerWeek],
                        ["学生名单", confirmPreview.snapshot.students?.length ?? 0],
                      ].map(([k, v]) => (
                        <div key={String(k)} className="contents">
                          <dt className="text-muted-foreground">{k}</dt>
                          <dd className="font-mono truncate">{v === undefined || v === null || v === "" ? "—" : String(v)}</dd>
                        </div>
                      ))}
                    </dl>
                  </div>
                )}

                {confirmPreview && (
                  <div className="sr-only" role="status" aria-live="polite">
                    校验完成:{confirmPreview.errors.length} 项错误,{confirmPreview.warnings.length} 项提示。
                  </div>
                )}
                {confirmPreview && confirmPreview.errors.length === 0 && confirmPreview.warnings.length === 0 && (
                  <div className="text-success"><span aria-hidden="true">✓ </span>未发现错误或提示,可继续确认。</div>
                )}
                {confirmPreview && confirmPreview.errors.length > 0 && (
                  <div>
                    <div className="font-medium text-destructive mb-1">错误({confirmPreview.errors.length})</div>
                    <ul className="space-y-1">
                      {confirmPreview.errors.map((e) => {
                        const loc = locateValidationField(e);
                        const anchor = loc ? loc.field.split(".")[0] : null;
                        return (
                          <li key={`e-${e}`} className="text-destructive flex flex-wrap gap-1 items-start">
                            {loc && (
                              <button
                                type="button"
                                onClick={() => {
                                  setConfirmPreview(null);
                                  navigate(`/projects/${project?.id}/edit?from=confirm#field-${anchor}`);
                                }}
                                className="inline-flex items-center rounded bg-destructive/15 hover:bg-destructive/25 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-destructive focus-visible:ring-offset-1 text-destructive px-1.5 py-0.5 text-[10px] font-mono shrink-0"
                                aria-label={`跳转到 ${loc.label}(${loc.field})字段并修正`}
                              >
                                <span>{loc.label}·{loc.field}</span>
                                <span aria-hidden="true" className="ml-0.5">↗</span>
                              </button>
                            )}
                            <span className="flex-1">{e}</span>
                          </li>
                        );
                      })}
                    </ul>
                  </div>
                )}
                {confirmPreview && confirmPreview.warnings.length > 0 && (
                  <div>
                    <div className="font-medium text-warning mb-1">提示({confirmPreview.warnings.length})</div>
                    <ul className="space-y-1">
                      {confirmPreview.warnings.map((w) => {
                        const loc = locateValidationField(w);
                        const anchor = loc ? loc.field.split(".")[0] : null;
                        return (
                          <li key={`w-${w}`} className="text-warning flex flex-wrap gap-1 items-start">
                            {loc && (
                              <button
                                type="button"
                                onClick={() => {
                                  setConfirmPreview(null);
                                  navigate(`/projects/${project?.id}/edit?from=confirm#field-${anchor}`);
                                }}
                                className="inline-flex items-center rounded bg-warning/15 hover:bg-warning/25 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-warning focus-visible:ring-offset-1 text-warning px-1.5 py-0.5 text-[10px] font-mono shrink-0"
                                aria-label={`跳转到 ${loc.label}(${loc.field})字段并复核`}
                              >
                                <span>{loc.label}·{loc.field}</span>
                                <span aria-hidden="true" className="ml-0.5">↗</span>
                              </button>
                            )}
                            <span className="flex-1">{w}</span>
                          </li>
                        );
                      })}
                    </ul>
                  </div>
                )}
                {confirmPreview && confirmPreview.errors.length > 0 && (
                  <div className="text-xs text-destructive">存在错误,无法继续确认。请先修正。</div>
                )}
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction
              disabled={!!confirmPreview?.errors.length}
              onClick={() => {
                setConfirmPreview(null);
                handleConfirm("confirmed");
              }}
            >
              继续确认
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function MetaCard({ label, value, mono }: { label: string; value: React.ReactNode; mono?: any }) {
  return (
    <div className="panel p-3 min-w-0">
      <div className="text-xs text-muted-foreground break-words">{label}</div>
      <div className={`mt-1 text-sm font-medium break-words ${mono ? "font-mono" : ""}`}>{value}</div>
    </div>
  );
}

function PlanView({ snapshot, ctx, procurementOn }: { snapshot: Snapshot; ctx: MatchContext; procurementOn: boolean }) {
  const plan = snapshot.costume_plan;
  const risks = (snapshot.risks ?? []) as any[];
  const schedule = (snapshot.reverse_schedule ?? []) as any[];
  const search = (snapshot.platform_search ?? []) as any[];
  return (
    <>
      {procurementOn && <ProcurementDisclaimer />}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <PlanTable title="女生方案 femalePlan" rows={plan.femalePlan} ctx={ctx} procurementOn={procurementOn} />
        <PlanTable title="男生方案 malePlan" rows={plan.malePlan} ctx={ctx} procurementOn={procurementOn} />
        <PlanTable title="配饰 accessories" rows={plan.accessories} ctx={ctx} procurementOn={procurementOn} />
      </div>

      <div className="panel">
        <div className="panel-header">
          <h3 className="text-sm font-semibold">总额估算</h3>
          <ToneBadge tone="muted">v{snapshot.version} · {snapshot.mode}</ToneBadge>
        </div>
        <div className="panel-body flex items-baseline gap-3">
          <div className="text-2xl font-semibold tabular-nums">¥ {plan.totalEstimate?.toLocaleString?.() ?? plan.totalEstimate}</div>
          <div className="text-xs text-muted-foreground">仅为估算,不代表真实 SKU/库存/价格。</div>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="panel">
          <div className="panel-header"><h3 className="text-sm font-semibold">风险列表 risks</h3></div>
          <div className="panel-body space-y-2">
            {risks.map((r, i) => (
              <div key={i} className="flex items-start gap-2 text-sm">
                <ToneBadge tone={r.level === "high" ? "destructive" : r.level === "medium" ? "warning" : "info"}>{r.level}</ToneBadge>
                <div>
                  <div className="font-medium">{r.title}</div>
                  <div className="text-xs text-muted-foreground">{r.detail}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
        <div className="panel">
          <div className="panel-header"><h3 className="text-sm font-semibold">Plan B 与采购策略</h3></div>
          <div className="panel-body space-y-2 text-sm">
            <div>
              <div className="text-xs text-muted-foreground mb-1">采购策略</div>
              <ul className="list-disc list-inside text-xs space-y-0.5 text-muted-foreground">
                {(plan.purchaseStrategy ?? []).map((p: string, i: number) => <li key={i}>{p}</li>)}
              </ul>
            </div>
            <div>
              <div className="text-xs text-muted-foreground mb-1">Plan B</div>
              <ul className="list-disc list-inside text-xs space-y-0.5 text-muted-foreground">
                {(plan.planB ?? []).map((p: string, i: number) => <li key={i}>{p}</li>)}
              </ul>
            </div>
            <div>
              <div className="text-xs text-muted-foreground mb-1">尺码提醒 sizingReminders</div>
              <ul className="list-disc list-inside text-xs space-y-0.5 text-muted-foreground">
                {(plan.sizingReminders ?? []).map((p: string, i: number) => <li key={i}>{p}</li>)}
              </ul>
            </div>
          </div>
        </div>
      </div>

      <div className="panel">
        <div className="panel-header">
          <h3 className="text-sm font-semibold">倒排时间表 reverseSchedule</h3>
          <span className="kbd-route">/reverse-schedule</span>
        </div>
        <div className="hidden md:block">
          <table className="ops-table">
            <thead><tr><th className="w-24">D-天数</th><th className="w-32">日期</th><th>任务</th><th className="w-32">负责人</th></tr></thead>
            <tbody>
              {schedule.map((s, i) => (
                <tr key={i}>
                  <td className="font-mono">D-{s.daysBefore}</td>
                  <td className="font-mono text-xs text-muted-foreground">{s.date ?? "—"}</td>
                  <td>{s.task}</td>
                  <td className="text-xs">{s.owner}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <MobileCardList>
          {schedule.map((s, i) => (
            <MobileCard
              key={i}
              title={<span className="font-mono">D-{s.daysBefore}</span>}
              right={<span className="font-mono text-[11px] text-muted-foreground">{s.date ?? "—"}</span>}
            >
              <MobileField label="任务" value={s.task} stack />
              <MobileField label="负责人" value={s.owner} />
            </MobileCard>
          ))}
        </MobileCardList>
      </div>

      <div className="panel">
        <div className="panel-header">
          <h3 className="text-sm font-semibold">平台搜索建议 platformSearch</h3>
          <ToneBadge tone="warning">仅建议 · 需人工核验</ToneBadge>
        </div>
        <div className="panel-body space-y-2">
          <div className="text-xs text-muted-foreground">
            以下为搜索关键词与链接,不代表真实 SKU、库存、价格或采购承诺。所有商品与商务信息需人工核验后才能作为采购依据。
          </div>
          <div className="hidden md:block">
            <table className="ops-table">
              <thead><tr><th className="w-24">平台</th><th>关键词</th><th className="w-24">链接</th><th>说明</th></tr></thead>
              <tbody>
                {search.map((s, i) => (
                  <tr key={i}>
                    <td>{s.platform}</td>
                    <td className="font-mono text-xs">{s.query}</td>
                    <td><a href={s.url} target="_blank" rel="noreferrer" className="text-primary text-xs hover:underline inline-flex items-center gap-1">打开 <ExternalLink className="h-3 w-3" /></a></td>
                    <td className="text-xs text-muted-foreground">{s.note}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <MobileCardList className="p-0 pt-2">
            {search.map((s, i) => (
              <MobileCard
                key={i}
                title={s.platform}
                right={
                  <a href={s.url} target="_blank" rel="noreferrer" className="text-primary text-xs hover:underline inline-flex items-center gap-1">
                    打开 <ExternalLink className="h-3 w-3" />
                  </a>
                }
              >
                <MobileField label="关键词" value={<span className="font-mono">{s.query}</span>} stack />
                <MobileField label="说明" value={<span className="text-muted-foreground">{s.note}</span>} stack />
              </MobileCard>
            ))}
          </MobileCardList>
        </div>
      </div>
    </>
  );
}

function PlanTable({ title, rows, ctx, procurementOn }: { title: string; rows: any[]; ctx: MatchContext; procurementOn: boolean }) {
  const list = rows ?? [];
  const subtotal = list.reduce((sum, r) => sum + (Number(r.subtotal) || 0), 0);
  return (
    <div className="panel">
      <div className="panel-header">
        <h3 className="text-sm font-semibold">{title}</h3>
        <span className="text-xs font-mono text-muted-foreground">¥{subtotal}</span>
      </div>
      <div className="hidden md:block">
        <table className="ops-table">
          <thead><tr><th>项</th><th className="w-14 text-right">数量</th><th className="w-20 text-right">单价</th><th className="w-20 text-right">小计</th></tr></thead>
          <tbody>
            {list.map((r, i) => (
              <tr key={i}>
                <td>
                  <div className="font-medium text-xs">{r.category}</div>
                  <div className="text-xs text-muted-foreground">{r.description}</div>
                  {r.sizing && <div className="text-[10px] text-muted-foreground font-mono">size: {r.sizing}</div>}
                  {procurementOn && <ProcurementCandidatesToggle item={r} ctx={ctx} />}
                </td>
                <td className="text-right font-mono text-xs">{r.qty}</td>
                <td className="text-right font-mono text-xs">¥{r.unitEstimate}</td>
                <td className="text-right font-mono text-xs">¥{r.subtotal}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <MobileCardList empty="暂��条目">
        {list.map((r, i) => (
          <MobileCard
            key={i}
            title={
              <div className="min-w-0">
                <div className="text-sm font-medium break-words">{r.category}</div>
                <div className="text-xs text-muted-foreground break-words">{r.description}</div>
                {r.sizing && <div className="text-[10px] text-muted-foreground font-mono mt-0.5">size: {r.sizing}</div>}
              </div>
            }
          >
            <MobileField label="数量" value={r.qty} mono />
            <MobileField label="单价" value={`¥${r.unitEstimate}`} mono />
            <MobileField label="小计" value={`¥${r.subtotal}`} mono />
            {procurementOn && <div className="col-span-full"><ProcurementCandidatesToggle item={r} ctx={ctx} /></div>}
          </MobileCard>
        ))}
      </MobileCardList>
    </div>
  );
}

function PlaceholderCard({ icon, title, route }: { icon: React.ReactNode; title: string; route: string }) {
  return (
    <div className="panel p-4 border-dashed">
      <div className="flex items-center gap-2 text-sm font-medium">
        <span className="text-muted-foreground">{icon}</span>
        {title}
      </div>
      <div className="mt-1 kbd-route">{route}</div>
      <div className="mt-2 text-xs text-muted-foreground">占位卡片。真实渲染将在未来集成 StageOS 后端后展示。</div>
    </div>
  );
}

function buildExportPayload(p: Project, input: StageInputData | null, s: Snapshot) {
  return {
    project: { ...p, ...(input ?? {}), title: p.title },
    input,
    snapshot: { ...s, project: { title: p.title } },
    plan: s.costume_plan,
    risks: s.risks ?? [],
    planB: s.costume_plan?.planB ?? s.costume_plan?.plan_b ?? [],
    reverseSchedule: s.reverse_schedule ?? [],
    platform_search: s.platform_search ?? [],
    exportedAt: new Date().toISOString(),
    disclaimer: "所有价格/SKU/库存为估算或搜索建议,不代表真实采购承诺。",
  };
}

type ValidationEntry = { checkedAt: string; errors: string[]; warnings: string[] };

function ValidationHistoryPanel({ input }: { input: StageInputData | null }) {
  if (!input) return null;
  const raw = input as StageInputData & { __validation?: ValidationEntry; __validationHistory?: ValidationEntry[] };
  const history: ValidationEntry[] =
    Array.isArray(raw.__validationHistory) && raw.__validationHistory.length > 0
      ? raw.__validationHistory
      : raw.__validation
        ? [raw.__validation]
        : [];
  if (history.length === 0) return null;
  const ordered = [...history].reverse(); // newest first
  const latestIdx = 0;

  const diff = (curr: string[], prev: string[] | undefined) => {
    const prevSet = new Set(prev ?? []);
    const currSet = new Set(curr);
    const added = curr.filter((x) => !prevSet.has(x));
    const removed = (prev ?? []).filter((x) => !currSet.has(x));
    return { added, removed };
  };

  return (
    <div className="panel">
      <div className="panel-header">
        <h3 className="text-sm font-semibold">校验历史</h3>
        <span className="text-xs text-muted-foreground">共 {history.length} 次,保留最近 {history.length} 条</span>
      </div>
      <div className="panel-body space-y-2">
        {ordered.map((entry, i) => {
          const prev = ordered[i + 1]; // older
          const errDiff = diff(entry.errors ?? [], prev?.errors);
          const warnDiff = diff(entry.warnings ?? [], prev?.warnings);
          const isLatest = i === latestIdx;
          return (
            <div
              key={`${entry.checkedAt}-${i}`}
              className={`rounded-md border p-3 ${isLatest ? "border-primary/40 bg-primary/5" : "border-border"}`}
            >
              <div className="flex flex-wrap items-center gap-2 mb-1">
                <span className="font-mono text-xs text-muted-foreground">
                  {new Date(entry.checkedAt).toLocaleString("zh-CN", { hour12: false })}
                </span>
                {isLatest && <ToneBadge tone="primary">最近一次</ToneBadge>}
                <ToneBadge tone={(entry.errors?.length ?? 0) > 0 ? "destructive" : "success"}>
                  错误 {entry.errors?.length ?? 0}
                </ToneBadge>
                <ToneBadge tone={(entry.warnings?.length ?? 0) > 0 ? "warning" : "muted"}>
                  提示 {entry.warnings?.length ?? 0}
                </ToneBadge>
                {prev && (errDiff.added.length + errDiff.removed.length + warnDiff.added.length + warnDiff.removed.length > 0) && (
                  <span className="text-[11px] text-muted-foreground">
                    变化 +{errDiff.added.length + warnDiff.added.length} / -{errDiff.removed.length + warnDiff.removed.length}
                  </span>
                )}
              </div>
              {(errDiff.added.length > 0 || errDiff.removed.length > 0 || warnDiff.added.length > 0 || warnDiff.removed.length > 0) && (
                <ul className="text-[11px] space-y-0.5 mt-1">
                  {errDiff.added.map((x) => <li key={`ea-${x}`} className="text-destructive">+ 错误:{x}</li>)}
                  {errDiff.removed.map((x) => <li key={`er-${x}`} className="text-muted-foreground line-through">- 错误:{x}</li>)}
                  {warnDiff.added.map((x) => <li key={`wa-${x}`} className="text-warning">+ 提示:{x}</li>)}
                  {warnDiff.removed.map((x) => <li key={`wr-${x}`} className="text-muted-foreground line-through">- 提示:{x}</li>)}
                </ul>
              )}
              {!prev && ((entry.errors?.length ?? 0) + (entry.warnings?.length ?? 0) > 0) && (
                <ul className="text-[11px] space-y-0.5 mt-1">
                  {(entry.errors ?? []).map((x) => <li key={`e-${x}`} className="text-destructive">错误:{x}</li>)}
                  {(entry.warnings ?? []).map((x) => <li key={`w-${x}`} className="text-warning">提示:{x}</li>)}
                </ul>
              )}
              {prev &&
                errDiff.added.length === 0 && errDiff.removed.length === 0 &&
                warnDiff.added.length === 0 && warnDiff.removed.length === 0 && (
                  <div className="text-[11px] text-muted-foreground">与上一次相比无变化</div>
                )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

