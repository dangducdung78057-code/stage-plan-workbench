import { useEffect, useMemo, useState } from "react";
import { useParams, Link, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { StatusBadge, ToneBadge } from "@/components/StatusBadge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  validateStageInput, type StageInputData, PROGRAM_TYPES, SCHOOL_STAGES, CONFIRMATION_STATUSES,
} from "@/lib/stageos";
import { generateMockPlan } from "@/lib/mockPlan";
import { toast } from "sonner";
import {
  ArrowLeft, Sparkles, FileJson, FileText, CheckCircle2, AlertTriangle,
  ExternalLink, Image as ImageIcon, Video, Layers as LayersIcon, Wand2,
} from "lucide-react";
import { MobileCard, MobileCardList, MobileField } from "@/components/MobileCard";

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

      const { costumePlan, risks, reverseSchedule, platformSearch } = generateMockPlan(input);
      const nextVersion = (snapshots[0]?.version ?? 0) + 1;
      const { error } = await supabase.from("plan_snapshots").insert({
        project_id: project.id, version: nextVersion, mode: "mock",
        costume_plan: costumePlan as any, risks: risks as any,
        reverse_schedule: reverseSchedule as any, platform_search: platformSearch as any,
      });
      if (error) throw error;
      await supabase.from("projects").update({ status: "planning" }).eq("id", project.id);
      toast.success(`已生成 v${nextVersion} 服装总表(mock)`);
      setGenerationNotice(null);
      load();
    } catch (e: any) { toast.error("生成失败:" + e.message); }
    finally { setBusy(false); }
  }

  async function handleConfirm(newStatus: "draft" | "needs_revision" | "confirmed") {
    if (!project) return;
    setBusy(true);
    try {
      // Privacy/user confirmation can be recorded before a snapshot exists;
      // snapshot-level confirmation attaches the latest snapshot when available.
      await supabase.from("confirmation_records").insert({
        project_id: project.id, snapshot_id: latest?.id ?? null,
        status: newStatus, notes: notes || null,
        confirmed_at: newStatus === "confirmed" ? new Date().toISOString() : null,
      });
      const projectStatus = newStatus === "confirmed" ? "confirmed" : newStatus === "needs_revision" ? "needs_revision" : "planning";
      await supabase.from("projects").update({ status: projectStatus }).eq("id", project.id);
      toast.success("已更新确认状态");
      setNotes("");
      load();
    } catch (e: any) { toast.error(e.message); }
    finally { setBusy(false); }
  }

  async function handleExport(format: "json" | "markdown") {
    if (!project || !latest) return;
    setBusy(true);
    try {
      const payload = format === "json" ? buildJsonExport(project, input, latest) : buildMarkdownExport(project, input, latest);
      await supabase.from("export_records").insert({
        project_id: project.id, snapshot_id: latest.id,
        version: latest.version, format, payload,
      });
      await supabase.from("projects").update({ status: "exported" }).eq("id", project.id);
      const blob = new Blob([payload], { type: format === "json" ? "application/json" : "text/markdown" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url; a.download = `${project.title}-v${latest.version}.${format === "json" ? "json" : "md"}`;
      a.click(); URL.revokeObjectURL(url);
      toast.success(`已导出 ${format.toUpperCase()}`);
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
            title={hasPrivacyConfirmation ? "生成 Mock 排产" : "请先完成用户/隐私确认"}
            className="w-full md:w-auto justify-center"
          >
            <Sparkles className="h-4 w-4 mr-1" />生成 Mock 排产
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

      <div className="grid grid-cols-4 gap-3">
        <MetaCard label="学段" value={stageLabel} />
        <MetaCard label="节目类型" value={programLabel} mono={input?.programType} />
        <MetaCard label="总人数 / 男 / 女" value={`${input?.performerCount ?? "—"} / ${input?.maleCount ?? "—"} / ${input?.femaleCount ?? "—"}`} />
        <MetaCard label="演出日期" value={project.performance_date ?? "—"} mono />
      </div>

      <Tabs defaultValue="plan">
        <TabsList>
          <TabsTrigger value="plan">服装总表工作区</TabsTrigger>
          <TabsTrigger value="confirm">确认 <span className="kbd-route ml-1">/confirm</span></TabsTrigger>
          <TabsTrigger value="export">导出 <span className="kbd-route ml-1">/export</span></TabsTrigger>
          <TabsTrigger value="render">渲染上下文 <span className="kbd-route ml-1">/render-context</span></TabsTrigger>
        </TabsList>

        <TabsContent value="plan" className="space-y-4 mt-4">
          {!latest && (
            <div className="panel panel-body text-sm text-muted-foreground text-center py-10">
              尚未生成排产。点击右上角 <b>生成 Mock 排产</b>。<br />
              <span className="text-xs">流程:compile-prompt → costume-master-plan → gated-output → confirm → export</span>
            </div>
          )}
          {latest && <PlanView snapshot={latest} />}
          {snapshots.length > 1 && (
            <div className="panel">
              <div className="panel-header"><h3 className="text-sm font-semibold">历史快照</h3></div>
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
                <Button size="sm" onClick={() => handleConfirm("confirmed")} disabled={busy}>
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
    </div>
  );
}

function MetaCard({ label, value, mono }: { label: string; value: React.ReactNode; mono?: any }) {
  return (
    <div className="panel p-3">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className={`mt-1 text-sm font-medium ${mono ? "font-mono" : ""}`}>{value}</div>
    </div>
  );
}

function PlanView({ snapshot }: { snapshot: Snapshot }) {
  const plan = snapshot.costume_plan;
  const risks = (snapshot.risks ?? []) as any[];
  const schedule = (snapshot.reverse_schedule ?? []) as any[];
  const search = (snapshot.platform_search ?? []) as any[];
  return (
    <>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <PlanTable title="女生方案 femalePlan" rows={plan.femalePlan} />
        <PlanTable title="男生方案 malePlan" rows={plan.malePlan} />
        <PlanTable title="配饰 accessories" rows={plan.accessories} />
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

function PlanTable({ title, rows }: { title: string; rows: any[] }) {
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
                </td>
                <td className="text-right font-mono text-xs">{r.qty}</td>
                <td className="text-right font-mono text-xs">¥{r.unitEstimate}</td>
                <td className="text-right font-mono text-xs">¥{r.subtotal}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <MobileCardList empty="暂无条目">
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

function buildJsonExport(p: Project, input: StageInputData | null, s: Snapshot) {
  return JSON.stringify({
    project: p, input, snapshot: s, exportedAt: new Date().toISOString(),
    disclaimer: "所有价格/SKU/库存为估算或搜索建议,不代表真实采购承诺。",
  }, null, 2);
}
function buildMarkdownExport(p: Project, input: StageInputData | null, s: Snapshot) {
  const plan = s.costume_plan;
  const lines: string[] = [];
  lines.push(`# ${p.title} — 服装总表 v${s.version}`);
  lines.push(`> 生成时间: ${new Date(s.generated_at).toLocaleString("zh-CN")} · 模式: ${s.mode}`);
  lines.push("");
  lines.push(`- 学段: ${input?.schoolStage ?? "—"}`);
  lines.push(`- 节目类型: ${input?.programType ?? "—"}`);
  lines.push(`- 演出日期: ${p.performance_date ?? "—"}`);
  lines.push(`- 总人数: ${input?.performerCount ?? "—"} (男 ${input?.maleCount ?? "—"} / 女 ${input?.femaleCount ?? "—"})`);
  lines.push("");
  const section = (t: string, rows: any[]) => {
    lines.push(`## ${t}`);
    lines.push("| 类别 | 描述 | 数量 | 单价 | 小计 |");
    lines.push("| --- | --- | ---: | ---: | ---: |");
    (rows ?? []).forEach((r) => lines.push(`| ${r.category} | ${r.description} | ${r.qty} | ${r.unitEstimate} | ${r.subtotal} |`));
    lines.push("");
  };
  section("女生方案", plan.femalePlan);
  section("男生方案", plan.malePlan);
  section("配饰", plan.accessories);
  lines.push(`## 总额估算: ¥ ${plan.totalEstimate}`);
  lines.push("");
  lines.push("## 风险");
  (s.risks ?? []).forEach((r: any) => lines.push(`- **[${r.level}] ${r.title}** — ${r.detail}`));
  lines.push("");
  lines.push("## 倒排");
  (s.reverse_schedule ?? []).forEach((r: any) => lines.push(`- D-${r.daysBefore} ${r.date ?? ""} · ${r.task} · ${r.owner}`));
  lines.push("");
  lines.push("> 免责声明:所有商品/价格/库存信息为估算或搜索建议,需人工核验。");
  return lines.join("\n");
}
