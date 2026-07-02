import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  SCHOOL_STAGES, PROGRAM_TYPES, REHEARSAL_FREQUENCIES,
  validateStageInput, type StageInputData,
} from "@/lib/stageos";
import { generateMockPlan } from "@/lib/mockPlan";
import { toast } from "sonner";
import {
  ArrowLeft, ArrowRight, Check, AlertTriangle, Plus, Trash2, Wand2, CheckCircle2, Circle,
  Save, RotateCcw, FolderOpen, Copy, FilePlus2, Pencil, ChevronDown, ChevronUp, ChevronLeft, ChevronRight,
} from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

const LEGACY_KEY = "stageos:wizard:draft:v1";
const DRAFTS_KEY = "stageos:wizard:drafts:v2";
const ACTIVE_KEY = "stageos:wizard:active:v2";

type WizardDraft = {
  id: string;
  name: string;
  step: number;
  title: string;
  data: StageInputData;
  savedAt: string;
};

function loadDrafts(): WizardDraft[] {
  try {
    const raw = localStorage.getItem(DRAFTS_KEY);
    if (raw) return JSON.parse(raw) as WizardDraft[];
    // migrate legacy single-draft
    const legacy = localStorage.getItem(LEGACY_KEY);
    if (legacy) {
      const d = JSON.parse(legacy);
      const migrated: WizardDraft = {
        id: crypto.randomUUID(),
        name: d.title?.trim() || "默认草稿",
        step: d.step ?? 0,
        title: d.title ?? "",
        data: d.data ?? { rehearsalFrequencyPerWeek: 3 },
        savedAt: d.savedAt ?? new Date().toISOString(),
      };
      localStorage.setItem(DRAFTS_KEY, JSON.stringify([migrated]));
      localStorage.setItem(ACTIVE_KEY, migrated.id);
      localStorage.removeItem(LEGACY_KEY);
      return [migrated];
    }
  } catch { /* ignore */ }
  return [];
}
function writeDrafts(list: WizardDraft[]) {
  localStorage.setItem(DRAFTS_KEY, JSON.stringify(list));
}

type Student = NonNullable<StageInputData["students"]>[number];

type StepDef = { key: string; title: string; hint: string };

const STEPS: StepDef[] = [
  { key: "basic",   title: "基础信息",     hint: "项目标题、学段、节目类型与日程" },
  { key: "counts",  title: "人数与预算",   hint: "总人数 / 男女构成 / 人均预算" },
  { key: "visual",  title: "视觉与期待",   hint: "主题色、灯光风格与特殊期待" },
  { key: "roster",  title: "学生名录",     hint: "匿名 studentId,不采集真实姓名(可选)" },
  { key: "review",  title: "校验与生成",   hint: "确认信息 → 保存并生成 mock 计划" },
];

export default function ProjectWizard() {
  const navigate = useNavigate();
  const [step, setStep] = useState(0);
  const [title, setTitle] = useState("");
  const [data, setData] = useState<StageInputData>({ rehearsalFrequencyPerWeek: 3 });
  const [submitting, setSubmitting] = useState(false);
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const [hydrated, setHydrated] = useState(false);
  const [drafts, setDrafts] = useState<WizardDraft[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const autosaveRef = useRef<number | null>(null);
  const [expandedIssueDrafts, setExpandedIssueDrafts] = useState<Set<string>>(new Set());
  const [popoverNavIndex, setPopoverNavIndex] = useState<Record<string, number>>({});

  // Restore drafts on mount
  useEffect(() => {
    const list = loadDrafts();
    setDrafts(list);
    const storedActive = localStorage.getItem(ACTIVE_KEY);
    const target = list.find((d) => d.id === storedActive) ?? list[0];
    if (target) {
      setActiveId(target.id);
      setStep(target.step ?? 0);
      setTitle(target.title ?? "");
      setData(target.data ?? { rehearsalFrequencyPerWeek: 3 });
      setSavedAt(target.savedAt ?? null);
      toast.success(`已恢复草稿 · ${target.name}`, {
        description: `保存于 ${new Date(target.savedAt).toLocaleString()} · step ${(target.step ?? 0) + 1}/${STEPS.length}`,
      });
    }
    setHydrated(true);
  }, []);

  // Autosave (debounced) to active draft slot; auto-create on first meaningful edit
  useEffect(() => {
    if (!hydrated) return;
    if (autosaveRef.current) window.clearTimeout(autosaveRef.current);
    autosaveRef.current = window.setTimeout(() => {
      const isEmpty = !title.trim() && Object.keys(data).length <= 1;
      if (isEmpty && !activeId) return;
      const now = new Date().toISOString();
      setDrafts((prev) => {
        let list = [...prev];
        let id = activeId;
        if (!id) {
          id = crypto.randomUUID();
          const name = title.trim() || `草稿 ${list.length + 1}`;
          list.unshift({ id, name, step, title, data, savedAt: now });
          setActiveId(id);
          localStorage.setItem(ACTIVE_KEY, id);
        } else {
          list = list.map((d) => d.id === id ? { ...d, step, title, data, savedAt: now } : d);
        }
        try { writeDrafts(list); setSavedAt(now); } catch { /* quota */ }
        return list;
      });
    }, 600);
    return () => { if (autosaveRef.current) window.clearTimeout(autosaveRef.current); };
  }, [hydrated, step, title, data, activeId]);

  const set = <K extends keyof StageInputData>(k: K, v: StageInputData[K]) =>
    setData((d) => ({ ...d, [k]: v }));

  const stepIssues = useMemo(() => validateStep(step, title, data), [step, title, data]);
  const globalIssues = useMemo(() => validateStageInput(data), [data]);
  const canNext = stepIssues.blockers.length === 0;

  const persistNow = (): string => {
    const now = new Date().toISOString();
    setDrafts((prev) => {
      let list = [...prev];
      let id = activeId;
      if (!id) {
        id = crypto.randomUUID();
        const name = title.trim() || `草稿 ${list.length + 1}`;
        list.unshift({ id, name, step, title, data, savedAt: now });
        setActiveId(id);
        localStorage.setItem(ACTIVE_KEY, id);
      } else {
        list = list.map((d) => d.id === id ? { ...d, step, title, data, savedAt: now } : d);
      }
      writeDrafts(list);
      return list;
    });
    setSavedAt(now);
    return now;
  };

  const saveDraftAndExit = () => {
    try {
      persistNow();
      toast.success("草稿已保存,下次进入向导可继续。");
      navigate("/projects");
    } catch {
      toast.error("保存草稿失败(存储配额限制)。");
    }
  };

  const clearForm = () => {
    setStep(0);
    setTitle("");
    setData({ rehearsalFrequencyPerWeek: 3 });
    setSavedAt(null);
  };

  const newDraft = () => {
    // ensure current is persisted first
    if (title.trim() || Object.keys(data).length > 1) persistNow();
    setActiveId(null);
    localStorage.removeItem(ACTIVE_KEY);
    clearForm();
    toast.success("已开始一份新草稿");
  };

  const switchDraft = (id: string) => {
    if (id === activeId) return;
    // persist current before switching
    if (activeId && (title.trim() || Object.keys(data).length > 1)) persistNow();
    const target = drafts.find((d) => d.id === id);
    if (!target) return;
    setActiveId(id);
    localStorage.setItem(ACTIVE_KEY, id);
    setStep(target.step ?? 0);
    setTitle(target.title ?? "");
    setData(target.data ?? { rehearsalFrequencyPerWeek: 3 });
    setSavedAt(target.savedAt ?? null);
    toast.success(`已切换到草稿 · ${target.name}`);
  };

  const duplicateDraft = (id: string) => {
    const src = drafts.find((d) => d.id === id);
    if (!src) return;
    const now = new Date().toISOString();
    const copy: WizardDraft = { ...src, id: crypto.randomUUID(), name: `${src.name} · 副本`, savedAt: now };
    const list = [copy, ...drafts];
    setDrafts(list); writeDrafts(list);
    setActiveId(copy.id); localStorage.setItem(ACTIVE_KEY, copy.id);
    setStep(copy.step); setTitle(copy.title); setData(copy.data); setSavedAt(now);
    toast.success(`已复制为新草稿 · ${copy.name}`);
  };

  const renameDraft = (id: string, name: string) => {
    const trimmed = name.trim();
    if (!trimmed) return;
    const list = drafts.map((d) => d.id === id ? { ...d, name: trimmed } : d);
    setDrafts(list); writeDrafts(list);
  };

  const deleteDraft = (id: string) => {
    const list = drafts.filter((d) => d.id !== id);
    setDrafts(list); writeDrafts(list);
    if (id === activeId) {
      const next = list[0];
      if (next) {
        setActiveId(next.id); localStorage.setItem(ACTIVE_KEY, next.id);
        setStep(next.step); setTitle(next.title); setData(next.data); setSavedAt(next.savedAt);
      } else {
        setActiveId(null); localStorage.removeItem(ACTIVE_KEY);
        clearForm();
      }
    }
    toast.success("草稿已删除");
  };

  const discardActive = () => {
    if (activeId) deleteDraft(activeId);
    else clearForm();
  };

  const activeDraft = drafts.find((d) => d.id === activeId);




  const goNext = () => {
    if (!canNext) {
      toast.error(stepIssues.blockers[0]);
      return;
    }
    setStep((s) => Math.min(STEPS.length - 1, s + 1));
  };
  const goPrev = () => setStep((s) => Math.max(0, s - 1));

  const allIssues = useMemo(() => collectIssues(title, data), [title, data]);

  const jumpToIssue = (issue: WizardIssue) => {
    setStep(issue.step);
    // Wait for step body to render, then focus + highlight the field.
    setTimeout(() => {
      const el = document.getElementById(issue.fieldId)
        ?? document.querySelector<HTMLElement>(`[data-field-wrapper="${issue.fieldId}"]`);
      if (!el) return;
      el.scrollIntoView({ behavior: "smooth", block: "center" });
      (el as HTMLElement).focus?.();
      const wrapper = el.closest<HTMLElement>("[data-field-wrapper]") ?? el;
      wrapper.classList.add("ring-2", "ring-warning", "rounded-md", "transition-shadow");
      window.setTimeout(() => {
        wrapper.classList.remove("ring-2", "ring-warning", "rounded-md");
      }, 1600);
    }, 80);
  };


  async function submit() {
    if (!title.trim()) { toast.error("请填写项目标题"); return; }
    setSubmitting(true);
    try {
      const { data: created, error } = await supabase.from("projects").insert({
        title,
        status: "planning",
        performance_date: data.performanceDate || null,
        performer_count: data.performerCount ?? null,
      }).select().single();
      if (error) throw error;
      const projectId = created.id;

      await supabase.from("stage_inputs").upsert({ project_id: projectId, data: data as any });

      // Generate mock plan snapshot immediately
      const plan = generateMockPlan(data);
      await supabase.from("plan_snapshots").insert({
        project_id: projectId,
        version: 1,
        mode: "mock",
        costume_plan: plan.costumePlan as any,
        risks: plan.risks as any,
        reverse_schedule: plan.reverseSchedule as any,
        platform_search: plan.platformSearch as any,
      });
      await supabase.from("confirmation_records").insert({
        project_id: projectId,
        status: "draft",
      });

      // remove the active draft slot once the project is created
      if (activeId) {
        const list = drafts.filter((d) => d.id !== activeId);
        setDrafts(list); writeDrafts(list);
        localStorage.removeItem(ACTIVE_KEY);
        setActiveId(null);
      }
      localStorage.removeItem(LEGACY_KEY);

      toast.success("项目已创建,mock 计划已生成");
      navigate(`/projects/${projectId}`);
    } catch (e: any) {
      toast.error("提交失败:" + e.message);
    } finally {
      setSubmitting(false);
    }
  }

  const addStudent = () => setData((d) => ({
    ...d,
    students: [
      ...(d.students ?? []),
      { studentId: `S${String((d.students?.length ?? 0) + 1).padStart(3, "0")}`, gender: "female", heightCm: 160 },
    ],
  }));
  const updateStudent = (idx: number, patch: Partial<Student>) => setData((d) => {
    const arr = [...(d.students ?? [])];
    arr[idx] = { ...arr[idx], ...patch };
    return { ...d, students: arr };
  });
  const removeStudent = (idx: number) =>
    setData((d) => ({ ...d, students: (d.students ?? []).filter((_, i) => i !== idx) }));

  return (
    <div className="p-6 space-y-5 max-w-5xl">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Button asChild variant="ghost" size="sm">
            <Link to="/projects"><ArrowLeft className="h-4 w-4 mr-1" />返回</Link>
          </Button>
          <h1 className="text-xl font-semibold">新建项目 · 向导</h1>
          <span className="kbd-route">wizard://projects/new</span>
        </div>
        <div className="flex items-center gap-2">
          {savedAt && (
            <span className="text-[11px] text-muted-foreground font-mono hidden sm:inline">
              draft saved · {new Date(savedAt).toLocaleTimeString()}
            </span>
          )}
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline" size="sm" title="草稿版本管理">
                <FolderOpen className="h-4 w-4 mr-1" />
                草稿
                <span className="ml-1.5 text-[10px] font-mono px-1.5 py-0.5 rounded bg-muted text-muted-foreground">
                  {drafts.length}
                </span>
              </Button>
            </PopoverTrigger>
            <PopoverContent align="end" className="w-[380px] p-0">
              <div className="px-3 py-2 border-b flex items-center justify-between">
                <div className="text-xs text-muted-foreground">
                  当前:<span className="font-medium text-foreground">{activeDraft?.name ?? "未保存"}</span>
                </div>
                <Button size="sm" variant="ghost" onClick={newDraft} className="h-7 px-2">
                  <FilePlus2 className="h-3.5 w-3.5 mr-1" />新建
                </Button>
              </div>
              <ul className="max-h-72 overflow-y-auto divide-y divide-border/60">
                {drafts.length === 0 && (
                  <li className="px-3 py-6 text-center text-xs text-muted-foreground">
                    尚无草稿。开始填写后将自动保存。
                  </li>
                )}
                {drafts.map((d) => {
                  const isActive = d.id === activeId;
                  const isRenaming = renamingId === d.id;
                  const issues = collectIssues(d.title, d.data);
                  const errCount = issues.filter((i) => i.severity === "error").length;
                  const warnCount = issues.filter((i) => i.severity === "warning").length;
                  const firstErr = issues.find((i) => i.severity === "error");
                  const firstWarn = issues.find((i) => i.severity === "warning");
                  const expanded = expandedIssueDrafts.has(d.id);
                  const top5 = issues.slice(0, 5);
                  const jumpTo = (issue: WizardIssue) => {
                    if (d.id !== activeId) switchDraft(d.id);
                    setTimeout(() => jumpToIssue(issue), d.id !== activeId ? 40 : 0);
                  };
                  const toggleExpand = () => {
                    setExpandedIssueDrafts((prev) => {
                      const next = new Set(prev);
                      if (next.has(d.id)) next.delete(d.id);
                      else next.add(d.id);
                      return next;
                    });
                  };
                  return (
                    <li key={d.id} className={`px-3 py-2 text-sm ${isActive ? "bg-primary/5" : ""}`}>
                      <div className="flex items-center gap-2">
                        {isRenaming ? (
                          <Input
                            autoFocus
                            className="h-7 text-sm"
                            value={renameValue}
                            onChange={(e) => setRenameValue(e.target.value)}
                            onBlur={() => { renameDraft(d.id, renameValue); setRenamingId(null); }}
                            onKeyDown={(e) => {
                              if (e.key === "Enter") { renameDraft(d.id, renameValue); setRenamingId(null); }
                              if (e.key === "Escape") setRenamingId(null);
                            }}
                          />
                        ) : (
                          <button
                            type="button"
                            onClick={() => switchDraft(d.id)}
                            className="flex-1 text-left truncate font-medium hover:text-primary"
                            title="切换到此草稿"
                          >
                            {isActive && <span className="text-[10px] font-mono text-primary mr-1">●</span>}
                            {d.name}
                          </button>
                        )}
                        {errCount > 0 && firstErr && (
                          <button
                            type="button"
                            onClick={() => jumpTo(firstErr)}
                            title={`${errCount} 项错误 · 点击定位到 step ${firstErr.step + 1}`}
                            className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-destructive/15 text-destructive hover:bg-destructive/25 shrink-0"
                          >
                            {errCount} 错
                          </button>
                        )}
                        {warnCount > 0 && firstWarn && (
                          <button
                            type="button"
                            onClick={() => jumpTo(firstWarn)}
                            title={`${warnCount} 项警告 · 点击定位到 step ${firstWarn.step + 1}`}
                            className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-warning/15 text-warning hover:bg-warning/25 shrink-0"
                          >
                            {warnCount} 警
                          </button>
                        )}
                        {errCount === 0 && warnCount === 0 && (
                          <span
                            title="所有校验通过"
                            className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-success/15 text-success shrink-0 inline-flex items-center gap-0.5"
                          >
                            <Check className="h-2.5 w-2.5" />OK
                          </span>
                        )}
                        <span className="text-[10px] font-mono text-muted-foreground shrink-0">
                          step {(d.step ?? 0) + 1}/{STEPS.length}
                        </span>
                      </div>

                      {/* Issue summary expand / collapse */}
                      <button
                        type="button"
                        onClick={toggleExpand}
                        className="mt-1.5 w-full flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground transition-colors"
                      >
                        {expanded ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
                        <span>{expanded ? "收起问题摘要" : `展开问题摘要 · 共 ${issues.length} 项`}</span>
                      </button>
                      {expanded && (
                        <div className="mt-1.5 rounded-md border border-border/60 bg-muted/40 divide-y divide-border/40">
                          {issues.length === 0 ? (
                            <div className="px-2 py-2 text-[11px] text-success flex items-center gap-1">
                              <Check className="h-3 w-3" />所有校验通过
                            </div>
                          ) : (
                            issues.map((it, idx) => (
                              <button
                                key={idx}
                                type="button"
                                onClick={() => jumpTo(it)}
                                className="w-full flex items-center gap-2 px-2 py-1.5 text-left hover:bg-muted/60 transition-colors"
                                title="点击定位到对应字段"
                              >
                                <span
                                  className={[
                                    "text-[10px] font-mono px-1 py-0.5 rounded shrink-0",
                                    it.severity === "error"
                                      ? "bg-destructive/10 text-destructive"
                                      : "bg-warning/15 text-warning",
                                  ].join(" ")}
                                >
                                  step {it.step + 1}
                                </span>
                                <span className="text-xs font-medium shrink-0">{it.label}</span>
                                <span className="text-[11px] text-muted-foreground truncate">{it.message}</span>
                              </button>
                            ))
                          )}
                          {issues.length > 0 && (
                            <div className="px-2 py-1.5 flex items-center justify-between bg-muted/60">
                              {(() => {
                                const navIdx = Math.max(0, Math.min((popoverNavIndex[d.id] ?? 0), issues.length - 1));
                                return (
                                  <>
                                    <button
                                      type="button"
                                      disabled={navIdx === 0}
                                      onClick={() => {
                                        const prev = Math.max(0, navIdx - 1);
                                        setPopoverNavIndex((s) => ({ ...s, [d.id]: prev }));
                                        jumpTo(issues[prev]);
                                      }}
                                      className="inline-flex items-center gap-0.5 text-[11px] px-2 py-1 rounded-md border border-border bg-background hover:bg-muted disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                                    >
                                      <ChevronLeft className="h-3 w-3" />上一问题
                                    </button>
                                    <span className="text-[11px] font-mono text-muted-foreground">
                                      {navIdx + 1} / {issues.length}
                                    </span>
                                    <button
                                      type="button"
                                      disabled={navIdx >= issues.length - 1}
                                      onClick={() => {
                                        const next = Math.min(issues.length - 1, navIdx + 1);
                                        setPopoverNavIndex((s) => ({ ...s, [d.id]: next }));
                                        jumpTo(issues[next]);
                                      }}
                                      className="inline-flex items-center gap-0.5 text-[11px] px-2 py-1 rounded-md border border-border bg-background hover:bg-muted disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                                    >
                                      下一问题<ChevronRight className="h-3 w-3" />
                                    </button>
                                  </>
                                );
                              })()}
                            </div>
                          )}
                        </div>
                      )}

                      <div className="mt-1 flex items-center justify-between text-[11px] text-muted-foreground">
                        <span className="font-mono">{new Date(d.savedAt).toLocaleString()}</span>
                        <div className="flex items-center gap-0.5">
                          <Button variant="ghost" size="icon" className="h-6 w-6"
                            title="重命名"
                            onClick={() => { setRenamingId(d.id); setRenameValue(d.name); }}>
                            <Pencil className="h-3 w-3" />
                          </Button>
                          <Button variant="ghost" size="icon" className="h-6 w-6"
                            title="另存为副本"
                            onClick={() => duplicateDraft(d.id)}>
                            <Copy className="h-3 w-3" />
                          </Button>
                          <Button variant="ghost" size="icon" className="h-6 w-6 text-destructive hover:text-destructive"
                            title="删除草稿"
                            onClick={() => deleteDraft(d.id)}>
                            <Trash2 className="h-3 w-3" />
                          </Button>
                        </div>
                      </div>
                    </li>
                  );
                })}
              </ul>
            </PopoverContent>
          </Popover>
          {activeId && (
            <Button variant="ghost" size="sm" onClick={discardActive} title="删除当前草稿并清空表单">
              <RotateCcw className="h-4 w-4 mr-1" />清空
            </Button>
          )}
          <Button variant="outline" size="sm" onClick={saveDraftAndExit}>
            <Save className="h-4 w-4 mr-1" />保存草稿并退出
          </Button>
          <Button asChild variant="ghost" size="sm">
            <Link to="/projects/new">切换到经典表单</Link>
          </Button>
        </div>
      </div>


      {/* Stepper */}
      <ol className="grid grid-cols-5 gap-2">
        {STEPS.map((s, i) => {
          const done = i < step;
          const active = i === step;
          const stepErrors = allIssues.filter((it) => it.step === i && it.severity === "error").length;
          const stepWarns = allIssues.filter((it) => it.step === i && it.severity === "warning").length;
          return (
            <li key={s.key}>
              <button
                type="button"
                onClick={() => setStep(i)}
                className={[
                  "w-full text-left rounded-md border px-3 py-2 transition-colors relative",
                  active ? "border-primary bg-primary/5"
                    : done ? "border-success/40 bg-success/5"
                    : "border-border bg-muted/30 hover:bg-muted/50",
                ].join(" ")}
              >
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  {done && stepErrors === 0 ? <CheckCircle2 className="h-3.5 w-3.5 text-success" />
                    : <Circle className={`h-3.5 w-3.5 ${active ? "text-primary" : ""}`} />}
                  <span className="font-mono">step {i + 1}/{STEPS.length}</span>
                  <div className="ml-auto flex items-center gap-1">
                    {stepErrors > 0 && (
                      <span
                        role="button"
                        title={`${stepErrors} 项错误 · 点击跳转`}
                        onClick={(e) => { e.stopPropagation(); setStep(i); }}
                        className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-destructive/15 text-destructive hover:bg-destructive/25"
                      >
                        {stepErrors} 错
                      </span>
                    )}
                    {stepWarns > 0 && (
                      <span
                        role="button"
                        title={`${stepWarns} 项警告 · 点击跳转`}
                        onClick={(e) => { e.stopPropagation(); setStep(i); }}
                        className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-warning/15 text-warning hover:bg-warning/25"
                      >
                        {stepWarns} 警
                      </span>
                    )}
                  </div>
                </div>
                <div className={`text-sm font-medium mt-0.5 ${active ? "text-foreground" : ""}`}>
                  {s.title}
                </div>
                <div className="text-[11px] text-muted-foreground mt-0.5 leading-snug">{s.hint}</div>
              </button>
            </li>
          );
        })}
      </ol>


      {/* Validation summary — click any issue to jump straight to the field */}
      {allIssues.length > 0 && (
        <div className="panel border-warning/40 bg-warning/5">
          <div className="panel-header">
            <h2 className="text-sm font-semibold text-warning inline-flex items-center gap-1.5">
              <AlertTriangle className="h-4 w-4" />
              校验汇总 · 共 {allIssues.length} 项
            </h2>
            <span className="text-[11px] text-muted-foreground font-mono">click to jump</span>
          </div>
          <div className="panel-body">
            <ul className="divide-y divide-border/60">
              {allIssues.map((it, i) => (
                <li key={i}>
                  <button
                    type="button"
                    onClick={() => jumpToIssue(it)}
                    className="w-full flex items-center gap-3 py-2 text-left hover:bg-warning/5 rounded px-1 -mx-1 transition-colors"
                  >
                    <span
                      className={[
                        "text-[10px] font-mono px-1.5 py-0.5 rounded shrink-0",
                        it.severity === "error"
                          ? "bg-destructive/10 text-destructive"
                          : "bg-warning/15 text-warning",
                      ].join(" ")}
                    >
                      step {it.step + 1}
                    </span>
                    <span className="text-sm font-medium shrink-0">{it.label}</span>
                    <span className="text-xs text-muted-foreground truncate flex-1">{it.message}</span>
                    <span className="text-xs text-primary hover:underline shrink-0">定位 →</span>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}

      {/* Step body */}

      <div className="panel">
        <div className="panel-header">
          <h2 className="text-sm font-semibold">
            {STEPS[step].title}
            <span className="ml-2 text-xs text-muted-foreground font-normal">{STEPS[step].hint}</span>
          </h2>
          {stepIssues.blockers.length > 0 && (
            <span className="text-xs text-warning inline-flex items-center gap-1">
              <AlertTriangle className="h-3.5 w-3.5" />还有 {stepIssues.blockers.length} 项待完成
            </span>
          )}
        </div>
        <div className="panel-body space-y-4">
          {step === 0 && (
            <div className="grid grid-cols-2 gap-4">
              <Field label="项目标题" required htmlFor="w-title">
                <Input id="w-title" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="如:2026 春季合唱汇演 · 高一 3 班" />
              </Field>
              <Field label="学段 schoolStage" required htmlFor="w-schoolStage">
                <Select value={data.schoolStage} onValueChange={(v) => set("schoolStage", v)}>
                  <SelectTrigger id="w-schoolStage"><SelectValue placeholder="选择学段" /></SelectTrigger>
                  <SelectContent>
                    {SCHOOL_STAGES.map((s) => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </Field>
              <Field label="节目类型 programType" required htmlFor="w-programType">
                <Select value={data.programType} onValueChange={(v) => set("programType", v)}>
                  <SelectTrigger id="w-programType"><SelectValue placeholder="选择节目类型" /></SelectTrigger>
                  <SelectContent className="max-h-72">
                    {PROGRAM_TYPES.map((s) => (
                      <SelectItem key={s.value} value={s.value}>
                        {s.label} · <span className="font-mono text-xs text-muted-foreground">{s.value}</span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
              <Field label="节目主题 programTheme" required htmlFor="w-programTheme">
                <Input id="w-programTheme" value={data.programTheme ?? ""} onChange={(e) => set("programTheme", e.target.value)} placeholder="如:光的礼赞" />
              </Field>
              <Field label="场地类型 venueType" htmlFor="w-venueType">
                <Input id="w-venueType" value={data.venueType ?? ""} onChange={(e) => set("venueType", e.target.value)} placeholder="室内剧场 / 露天舞台 …" />
              </Field>
              <Field label="演出日期 performanceDate" required htmlFor="w-performanceDate">
                <Input id="w-performanceDate" type="date" value={data.performanceDate ?? ""} onChange={(e) => set("performanceDate", e.target.value)} />
              </Field>
              <Field label="彩排频次(次/周)" required htmlFor="w-rehearsalFrequencyPerWeek">
                <Select
                  value={String(data.rehearsalFrequencyPerWeek ?? "")}
                  onValueChange={(v) => set("rehearsalFrequencyPerWeek", Number(v) as 2 | 3 | 5)}
                >
                  <SelectTrigger id="w-rehearsalFrequencyPerWeek"><SelectValue placeholder="选择彩排频次" /></SelectTrigger>
                  <SelectContent>
                    {REHEARSAL_FREQUENCIES.map((n) => <SelectItem key={n} value={String(n)}>{n} 次/周</SelectItem>)}
                  </SelectContent>
                </Select>
              </Field>
            </div>
          )}

          {step === 1 && (
            <>
              <div className="grid grid-cols-4 gap-4">
                <Field label="总人数 performerCount" required htmlFor="w-performerCount">
                  <Input id="w-performerCount" type="number" value={data.performerCount ?? ""} onChange={(e) => set("performerCount", e.target.value ? Number(e.target.value) : undefined)} />
                </Field>
                <Field label="男生数 maleCount" required htmlFor="w-maleCount">
                  <Input id="w-maleCount" type="number" value={data.maleCount ?? ""} onChange={(e) => set("maleCount", e.target.value ? Number(e.target.value) : undefined)} />
                </Field>
                <Field label="女生数 femaleCount" required htmlFor="w-femaleCount">
                  <Input id="w-femaleCount" type="number" value={data.femaleCount ?? ""} onChange={(e) => set("femaleCount", e.target.value ? Number(e.target.value) : undefined)} />
                </Field>
                <Field label="人均预算 perPersonBudget (元)" required htmlFor="w-perPersonBudget">
                  <Input id="w-perPersonBudget" type="number" value={data.perPersonBudget ?? ""} onChange={(e) => set("perPersonBudget", e.target.value ? Number(e.target.value) : undefined)} />
                </Field>
              </div>
              <CountsHint data={data} />
            </>
          )}

          {step === 2 && (
            <div className="grid grid-cols-2 gap-4">
              <Field label="屏幕主题色 screenThemeColor" required htmlFor="w-screenThemeColor">
                <Input id="w-screenThemeColor" value={data.screenThemeColor ?? ""} onChange={(e) => set("screenThemeColor", e.target.value)} placeholder="如:靛蓝 / #1E3A8A" />
              </Field>
              <Field label="灯光风格 lightingStyle" required htmlFor="w-lightingStyle">
                <Input id="w-lightingStyle" value={data.lightingStyle ?? ""} onChange={(e) => set("lightingStyle", e.target.value)} placeholder="如:暖调聚光 / 冷色氛围" />
              </Field>
              <div className="col-span-2">
                <Field label="特殊期待 specialExpectation" htmlFor="w-specialExpectation">
                  <Textarea id="w-specialExpectation" rows={3} value={data.specialExpectation ?? ""} onChange={(e) => set("specialExpectation", e.target.value)} placeholder="如:主色需契合校徽色系;避免过多亮片" />
                </Field>
              </div>
            </div>
          )}


          {step === 3 && (
            <div id="w-students-panel" data-field-wrapper="w-students-panel" tabIndex={-1} className="space-y-3 outline-none">
              <div className="flex items-center justify-between">
                <p className="text-xs text-muted-foreground">
                  仅使用 studentId 匿名标识,不采集真实姓名。学生行数需与总人数一致时才通过校验;为空则跳过此校验。
                </p>
                <Button variant="outline" size="sm" onClick={addStudent}>
                  <Plus className="h-3.5 w-3.5 mr-1" />添加学生
                </Button>
              </div>
              <div className="overflow-x-auto">
                <table className="ops-table">
                  <thead>
                    <tr>
                      <th className="w-32">studentId</th>
                      <th className="w-24">gender</th>
                      <th className="w-28">heightCm</th>
                      <th>roleLabel(可选)</th>
                      <th className="w-12"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {(data.students ?? []).length === 0 && (
                      <tr>
                        <td colSpan={5} className="text-center py-6 text-muted-foreground text-sm">
                          尚未添加。可跳过此步或添加匿名学生用于尺码摸底。
                        </td>
                      </tr>
                    )}
                    {(data.students ?? []).map((s, i) => (
                      <tr key={i}>
                        <td><Input className="h-7 font-mono text-xs" value={s.studentId} onChange={(e) => updateStudent(i, { studentId: e.target.value })} /></td>
                        <td>
                          <Select value={s.gender} onValueChange={(v) => updateStudent(i, { gender: v as any })}>
                            <SelectTrigger className="h-7"><SelectValue /></SelectTrigger>
                            <SelectContent>
                              <SelectItem value="female">女</SelectItem>
                              <SelectItem value="male">男</SelectItem>
                            </SelectContent>
                          </Select>
                        </td>
                        <td><Input className="h-7 font-mono text-xs" type="number" value={s.heightCm} onChange={(e) => updateStudent(i, { heightCm: Number(e.target.value) })} /></td>
                        <td><Input className="h-7" value={s.roleLabel ?? ""} onChange={(e) => updateStudent(i, { roleLabel: e.target.value })} placeholder="如:领唱 / 领舞" /></td>
                        <td><Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => removeStudent(i)}><Trash2 className="h-3.5 w-3.5" /></Button></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {step === 4 && (
            <div className="space-y-4">
              <ReviewSummary title={title} data={data} />
              {globalIssues.length > 0 ? (
                <div className="panel border-warning/40 bg-warning/5">
                  <div className="panel-body flex items-start gap-2 text-sm">
                    <AlertTriangle className="h-4 w-4 text-warning mt-0.5" />
                    <div>
                      <div className="font-medium text-warning">存在校验提示,建议返回修正后再生成</div>
                      <ul className="mt-1 list-disc list-inside text-muted-foreground text-xs space-y-0.5">
                        {globalIssues.map((i) => <li key={i}>{i}</li>)}
                      </ul>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="panel border-success/40 bg-success/5">
                  <div className="panel-body flex items-center gap-2 text-sm text-success">
                    <Check className="h-4 w-4" />
                    所有关键字段一致,可以保存并生成 mock 服装总表。
                  </div>
                </div>
              )}
              <div className="text-xs text-muted-foreground">
                下一步:保存项目 → 写入 stage_inputs → 生成 v1 plan_snapshot(mock)→ 初始化 confirmation_record(draft)。
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Footer nav */}
      <div className="flex items-center justify-between">
        <Button variant="outline" size="sm" onClick={goPrev} disabled={step === 0}>
          <ArrowLeft className="h-4 w-4 mr-1" />上一步
        </Button>
        <div className="text-xs text-muted-foreground">
          {stepIssues.blockers.length === 0
            ? "本步骤已满足条件"
            : `待补:${stepIssues.blockers.join(" · ")}`}
        </div>
        {step < STEPS.length - 1 ? (
          <Button size="sm" onClick={goNext} disabled={!canNext}>
            下一步<ArrowRight className="h-4 w-4 ml-1" />
          </Button>
        ) : (
          <Button size="sm" onClick={submit} disabled={submitting}>
            <Wand2 className="h-4 w-4 mr-1" />
            {submitting ? "生成中…" : "保存并生成 mock 计划"}
          </Button>
        )}
      </div>
    </div>
  );
}

export type WizardIssue = {
  step: number;
  fieldId: string;
  label: string;
  message: string;
  severity: "error" | "warning";
};

function collectIssues(title: string, d: StageInputData): WizardIssue[] {
  const out: WizardIssue[] = [];
  const err = (step: number, fieldId: string, label: string, message: string) =>
    out.push({ step, fieldId, label, message, severity: "error" });
  const warn = (step: number, fieldId: string, label: string, message: string) =>
    out.push({ step, fieldId, label, message, severity: "warning" });

  // Step 0
  if (!title.trim()) err(0, "w-title", "项目标题", "必填,用于工作台识别项目");
  if (!d.schoolStage) err(0, "w-schoolStage", "学段", "必选:primary / junior / senior");
  if (!d.programType) err(0, "w-programType", "节目类型", "必选");
  if (!d.programTheme?.trim()) err(0, "w-programTheme", "节目主题", "必填");
  if (!d.performanceDate) err(0, "w-performanceDate", "演出日期", "必填,用于生成倒排计划");
  if (!d.rehearsalFrequencyPerWeek) err(0, "w-rehearsalFrequencyPerWeek", "彩排频次", "必选:2 / 3 / 5");

  // Step 1
  if (typeof d.performerCount !== "number" || d.performerCount <= 0)
    err(1, "w-performerCount", "总人数 performerCount", "必填,正整数");
  if (typeof d.maleCount !== "number") err(1, "w-maleCount", "男生数 maleCount", "必填");
  if (typeof d.femaleCount !== "number") err(1, "w-femaleCount", "女生数 femaleCount", "必填");
  if (typeof d.perPersonBudget !== "number" || d.perPersonBudget <= 0)
    err(1, "w-perPersonBudget", "人均预算 perPersonBudget", "必填,正数");
  if (
    typeof d.performerCount === "number" &&
    typeof d.maleCount === "number" &&
    typeof d.femaleCount === "number" &&
    d.maleCount + d.femaleCount !== d.performerCount
  ) {
    err(1, "w-maleCount",
      "人数校验",
      `男(${d.maleCount}) + 女(${d.femaleCount}) = ${d.maleCount + d.femaleCount},与总人数 ${d.performerCount} 不一致`);
  }

  // Step 2
  if (!d.screenThemeColor?.trim()) err(2, "w-screenThemeColor", "屏幕主题色 screenThemeColor", "必填");
  if (!d.lightingStyle?.trim()) err(2, "w-lightingStyle", "灯光风格 lightingStyle", "必填");

  // Step 3 (roster)
  if (
    d.students && d.students.length > 0 &&
    typeof d.performerCount === "number" &&
    d.students.length !== d.performerCount
  ) {
    warn(3, "w-students-panel",
      "学生名录行数",
      `已填 ${d.students.length} 行,与总人数 ${d.performerCount} 不一致(清空或补齐)`);
  }

  return out;
}

function validateStep(step: number, title: string, d: StageInputData): { blockers: string[] } {
  const items = collectIssues(title, d).filter((i) => i.step === step);
  return { blockers: items.map((i) => i.label) };
}


function CountsHint({ data }: { data: StageInputData }) {
  const { performerCount, maleCount, femaleCount } = data;
  if (typeof performerCount !== "number" || typeof maleCount !== "number" || typeof femaleCount !== "number") {
    return <div className="text-xs text-muted-foreground">填入总人数与男/女构成后自动校验。</div>;
  }
  const sum = maleCount + femaleCount;
  const ok = sum === performerCount;
  return (
    <div className={`text-xs ${ok ? "text-success" : "text-warning"} flex items-center gap-1`}>
      {ok ? <Check className="h-3.5 w-3.5" /> : <AlertTriangle className="h-3.5 w-3.5" />}
      男({maleCount}) + 女({femaleCount}) = {sum} {ok ? "= " : "≠ "} 总人数({performerCount})
    </div>
  );
}

function ReviewSummary({ title, data }: { title: string; data: StageInputData }) {
  const programLabel = PROGRAM_TYPES.find((p) => p.value === data.programType)?.label ?? "—";
  const stageLabel = SCHOOL_STAGES.find((s) => s.value === data.schoolStage)?.label ?? "—";
  const rows: Array<[string, React.ReactNode]> = [
    ["项目标题", title || "—"],
    ["学段 / 节目", `${stageLabel} · ${programLabel}`],
    ["节目主题", data.programTheme || "—"],
    ["演出日期", data.performanceDate || "—"],
    ["彩排频次", data.rehearsalFrequencyPerWeek ? `${data.rehearsalFrequencyPerWeek} 次/周` : "—"],
    ["总人数 / 男 / 女", `${data.performerCount ?? "—"} / ${data.maleCount ?? "—"} / ${data.femaleCount ?? "—"}`],
    ["人均预算", data.perPersonBudget ? `¥${data.perPersonBudget}` : "—"],
    ["主题色 / 灯光", `${data.screenThemeColor || "—"} · ${data.lightingStyle || "—"}`],
    ["学生名录", data.students?.length ? `${data.students.length} 行(匿名)` : "未填(可选)"],
  ];
  return (
    <div className="grid grid-cols-2 gap-x-6 gap-y-1.5 text-sm">
      {rows.map(([k, v]) => (
        <div key={k} className="flex justify-between border-b border-border/60 py-1">
          <span className="text-muted-foreground text-xs">{k}</span>
          <span className="font-medium">{v}</span>
        </div>
      ))}
    </div>
  );
}

function Field({ label, required, htmlFor, children }: { label: string; required?: boolean; htmlFor?: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5" data-field-wrapper={htmlFor}>
      <Label htmlFor={htmlFor} className="text-xs text-muted-foreground">
        {label}{required && <span className="text-destructive ml-0.5">*</span>}
      </Label>
      {children}
    </div>
  );
}

