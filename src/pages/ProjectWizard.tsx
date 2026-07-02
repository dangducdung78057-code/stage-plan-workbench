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
  Save, RotateCcw,
} from "lucide-react";

const DRAFT_KEY = "stageos:wizard:draft:v1";

type WizardDraft = {
  step: number;
  title: string;
  data: StageInputData;
  savedAt: string;
};

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
  const autosaveRef = useRef<number | null>(null);

  // Restore draft on mount
  useEffect(() => {
    try {
      const raw = localStorage.getItem(DRAFT_KEY);
      if (raw) {
        const d = JSON.parse(raw) as WizardDraft;
        setStep(d.step ?? 0);
        setTitle(d.title ?? "");
        setData(d.data ?? { rehearsalFrequencyPerWeek: 3 });
        setSavedAt(d.savedAt ?? null);
        toast.success("已恢复上次草稿", {
          description: `保存于 ${d.savedAt ? new Date(d.savedAt).toLocaleString() : "未知时间"} · step ${(d.step ?? 0) + 1}/${STEPS.length}`,
        });
      }
    } catch { /* ignore */ }
    setHydrated(true);
  }, []);

  // Autosave (debounced) after hydration
  useEffect(() => {
    if (!hydrated) return;
    if (autosaveRef.current) window.clearTimeout(autosaveRef.current);
    autosaveRef.current = window.setTimeout(() => {
      const isEmpty = !title.trim() && Object.keys(data).length <= 1;
      if (isEmpty) return;
      const now = new Date().toISOString();
      const draft: WizardDraft = { step, title, data, savedAt: now };
      try {
        localStorage.setItem(DRAFT_KEY, JSON.stringify(draft));
        setSavedAt(now);
      } catch { /* quota */ }
    }, 600);
    return () => { if (autosaveRef.current) window.clearTimeout(autosaveRef.current); };
  }, [hydrated, step, title, data]);

  const set = <K extends keyof StageInputData>(k: K, v: StageInputData[K]) =>
    setData((d) => ({ ...d, [k]: v }));

  const stepIssues = useMemo(() => validateStep(step, title, data), [step, title, data]);
  const globalIssues = useMemo(() => validateStageInput(data), [data]);
  const canNext = stepIssues.blockers.length === 0;

  const saveDraftAndExit = () => {
    const now = new Date().toISOString();
    const draft: WizardDraft = { step, title, data, savedAt: now };
    try {
      localStorage.setItem(DRAFT_KEY, JSON.stringify(draft));
      toast.success("草稿已保存,下次进入向导可继续。");
      navigate("/projects");
    } catch {
      toast.error("保存草稿失败(存储配额限制)。");
    }
  };

  const discardDraft = () => {
    localStorage.removeItem(DRAFT_KEY);
    setStep(0);
    setTitle("");
    setData({ rehearsalFrequencyPerWeek: 3 });
    setSavedAt(null);
    toast.success("已清空草稿,重新开始。");
  };



  const goNext = () => {
    if (!canNext) {
      toast.error(stepIssues.blockers[0]);
      return;
    }
    setStep((s) => Math.min(STEPS.length - 1, s + 1));
  };
  const goPrev = () => setStep((s) => Math.max(0, s - 1));

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
        <Button asChild variant="ghost" size="sm">
          <Link to="/projects/new">切换到经典表单</Link>
        </Button>
      </div>

      {/* Stepper */}
      <ol className="grid grid-cols-5 gap-2">
        {STEPS.map((s, i) => {
          const done = i < step;
          const active = i === step;
          return (
            <li key={s.key}>
              <button
                type="button"
                onClick={() => i <= step && setStep(i)}
                className={[
                  "w-full text-left rounded-md border px-3 py-2 transition-colors",
                  active ? "border-primary bg-primary/5"
                    : done ? "border-success/40 bg-success/5"
                    : "border-border bg-muted/30 cursor-not-allowed opacity-70",
                ].join(" ")}
              >
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  {done ? <CheckCircle2 className="h-3.5 w-3.5 text-success" />
                    : <Circle className={`h-3.5 w-3.5 ${active ? "text-primary" : ""}`} />}
                  <span className="font-mono">step {i + 1}/{STEPS.length}</span>
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
              <Field label="项目标题" required>
                <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="如:2026 春季合唱汇演 · 高一 3 班" />
              </Field>
              <Field label="学段 schoolStage" required>
                <Select value={data.schoolStage} onValueChange={(v) => set("schoolStage", v)}>
                  <SelectTrigger><SelectValue placeholder="选择学段" /></SelectTrigger>
                  <SelectContent>
                    {SCHOOL_STAGES.map((s) => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </Field>
              <Field label="节目类型 programType" required>
                <Select value={data.programType} onValueChange={(v) => set("programType", v)}>
                  <SelectTrigger><SelectValue placeholder="选择节目类型" /></SelectTrigger>
                  <SelectContent className="max-h-72">
                    {PROGRAM_TYPES.map((s) => (
                      <SelectItem key={s.value} value={s.value}>
                        {s.label} · <span className="font-mono text-xs text-muted-foreground">{s.value}</span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
              <Field label="节目主题 programTheme" required>
                <Input value={data.programTheme ?? ""} onChange={(e) => set("programTheme", e.target.value)} placeholder="如:光的礼赞" />
              </Field>
              <Field label="场地类型 venueType">
                <Input value={data.venueType ?? ""} onChange={(e) => set("venueType", e.target.value)} placeholder="室内剧场 / 露天舞台 …" />
              </Field>
              <Field label="演出日期 performanceDate" required>
                <Input type="date" value={data.performanceDate ?? ""} onChange={(e) => set("performanceDate", e.target.value)} />
              </Field>
              <Field label="彩排频次(次/周)" required>
                <Select
                  value={String(data.rehearsalFrequencyPerWeek ?? "")}
                  onValueChange={(v) => set("rehearsalFrequencyPerWeek", Number(v) as 2 | 3 | 5)}
                >
                  <SelectTrigger><SelectValue placeholder="选择彩排频次" /></SelectTrigger>
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
                <Field label="总人数 performerCount" required>
                  <Input type="number" value={data.performerCount ?? ""} onChange={(e) => set("performerCount", e.target.value ? Number(e.target.value) : undefined)} />
                </Field>
                <Field label="男生数 maleCount" required>
                  <Input type="number" value={data.maleCount ?? ""} onChange={(e) => set("maleCount", e.target.value ? Number(e.target.value) : undefined)} />
                </Field>
                <Field label="女生数 femaleCount" required>
                  <Input type="number" value={data.femaleCount ?? ""} onChange={(e) => set("femaleCount", e.target.value ? Number(e.target.value) : undefined)} />
                </Field>
                <Field label="人均预算 perPersonBudget (元)" required>
                  <Input type="number" value={data.perPersonBudget ?? ""} onChange={(e) => set("perPersonBudget", e.target.value ? Number(e.target.value) : undefined)} />
                </Field>
              </div>
              <CountsHint data={data} />
            </>
          )}

          {step === 2 && (
            <div className="grid grid-cols-2 gap-4">
              <Field label="屏幕主题色 screenThemeColor" required>
                <Input value={data.screenThemeColor ?? ""} onChange={(e) => set("screenThemeColor", e.target.value)} placeholder="如:靛蓝 / #1E3A8A" />
              </Field>
              <Field label="灯光风格 lightingStyle" required>
                <Input value={data.lightingStyle ?? ""} onChange={(e) => set("lightingStyle", e.target.value)} placeholder="如:暖调聚光 / 冷色氛围" />
              </Field>
              <div className="col-span-2">
                <Field label="特殊期待 specialExpectation">
                  <Textarea rows={3} value={data.specialExpectation ?? ""} onChange={(e) => set("specialExpectation", e.target.value)} placeholder="如:主色需契合校徽色系;避免过多亮片" />
                </Field>
              </div>
            </div>
          )}

          {step === 3 && (
            <div className="space-y-3">
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

function validateStep(step: number, title: string, d: StageInputData): { blockers: string[] } {
  const b: string[] = [];
  if (step === 0) {
    if (!title.trim()) b.push("项目标题");
    if (!d.schoolStage) b.push("学段");
    if (!d.programType) b.push("节目类型");
    if (!d.programTheme?.trim()) b.push("节目主题");
    if (!d.performanceDate) b.push("演出日期");
    if (!d.rehearsalFrequencyPerWeek) b.push("彩排频次");
  } else if (step === 1) {
    if (typeof d.performerCount !== "number" || d.performerCount <= 0) b.push("总人数");
    if (typeof d.maleCount !== "number") b.push("男生数");
    if (typeof d.femaleCount !== "number") b.push("女生数");
    if (typeof d.perPersonBudget !== "number" || d.perPersonBudget <= 0) b.push("人均预算");
    if (
      typeof d.performerCount === "number" &&
      typeof d.maleCount === "number" &&
      typeof d.femaleCount === "number" &&
      d.maleCount + d.femaleCount !== d.performerCount
    ) b.push("男女之和 = 总人数");
  } else if (step === 2) {
    if (!d.screenThemeColor?.trim()) b.push("屏幕主题色");
    if (!d.lightingStyle?.trim()) b.push("灯光风格");
  } else if (step === 3) {
    if (d.students && d.students.length > 0 && typeof d.performerCount === "number"
      && d.students.length !== d.performerCount) b.push("学生行数 = 总人数(或清空)");
  }
  return { blockers: b };
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

function Field({ label, required, children }: { label: string; required?: boolean; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs text-muted-foreground">
        {label}{required && <span className="text-destructive ml-0.5">*</span>}
      </Label>
      {children}
    </div>
  );
}
