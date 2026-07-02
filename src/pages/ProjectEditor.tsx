import { useEffect, useState } from "react";
import { useNavigate, useParams, Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  SCHOOL_STAGES, PROGRAM_TYPES, REHEARSAL_FREQUENCIES,
  validateStageInputDetailed, appendValidationHistory, type StageInputData,
} from "@/lib/stageos";
import { toast } from "sonner";
import { Plus, Trash2, ArrowLeft, AlertTriangle, AlertCircle } from "lucide-react";

type Student = NonNullable<StageInputData["students"]>[number];

export default function ProjectEditor() {
  const { id } = useParams();
  const isEdit = Boolean(id);
  const navigate = useNavigate();
  const [title, setTitle] = useState("");
  const [status, setStatus] = useState("draft");
  const [data, setData] = useState<StageInputData>({ rehearsalFrequencyPerWeek: 3 });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!id) return;
    (async () => {
      const { data: p } = await supabase.from("projects").select("*").eq("id", id).maybeSingle();
      const { data: si } = await supabase.from("stage_inputs").select("data").eq("project_id", id).maybeSingle();
      if (p) { setTitle(p.title); setStatus(p.status); }
      if (si?.data) setData(si.data as StageInputData);
    })();
  }, [id]);

  const { errors, warnings } = validateStageInputDetailed(data);

  // 字段级联动提示:根据关键字把整体 errors/warnings 分派到对应输入下方。
  const pickHints = (keywords: string[]) => ({
    errors: errors.filter((m) => keywords.some((k) => m.includes(k))),
    warnings: warnings.filter((m) => keywords.some((k) => m.includes(k))),
  });
  const hints = {
    performerCount: pickHints(["performerCount", "总人数", "人数校验", "学生行数"]),
    maleCount: pickHints(["maleCount", "男生", "人数校验", "性别分布"]),
    femaleCount: pickHints(["femaleCount", "女生", "人数校验", "性别分布"]),
    perPersonBudget: pickHints(["人均预算", "perPersonBudget"]),
    rehearsal: pickHints(["彩排频次", "rehearsalFrequency"]),
    students: pickHints(["studentId", "heightCm", "学生行数", "性别分布"]),
  };

  const set = <K extends keyof StageInputData>(k: K, v: StageInputData[K]) =>
    setData((d) => ({ ...d, [k]: v }));

  const updateStudent = (idx: number, patch: Partial<Student>) => {
    setData((d) => {
      const arr = [...(d.students ?? [])];
      arr[idx] = { ...arr[idx], ...patch };
      return { ...d, students: arr };
    });
  };
  const addStudent = () => setData((d) => ({
    ...d,
    students: [...(d.students ?? []), { studentId: `S${String((d.students?.length ?? 0) + 1).padStart(3, "0")}`, gender: "female", heightCm: 160 }],
  }));
  const removeStudent = (idx: number) =>
    setData((d) => ({ ...d, students: (d.students ?? []).filter((_, i) => i !== idx) }));

  async function save() {
    if (!title.trim()) { toast.error("请填写项目标题"); return; }
    if (errors.length > 0) {
      toast.error(`存在 ${errors.length} 项校验错误,请先修正`);
      return;
    }
    setSaving(true);
    try {
      const { data: userData } = await supabase.auth.getUser();
      const uid = userData.user?.id;
      if (!uid) { toast.error("未登录"); setSaving(false); return; }
      let projectId = id;
      const validationSnapshot = {
        checkedAt: new Date().toISOString(),
        errors,
        warnings,
      };
      // Load previous stage_inputs so we can append to __validationHistory instead of overwriting.
      let prevData: StageInputData | null = null;
      if (isEdit && id) {
        const { data: prev } = await supabase.from("stage_inputs").select("data").eq("project_id", id).maybeSingle();
        prevData = (prev?.data as StageInputData) ?? null;
      }
      const persistedData = appendValidationHistory(prevData ?? data, validationSnapshot);
      if (isEdit && id) {
        await supabase.from("projects").update({
          title, status,
          performance_date: data.performanceDate || null,
          performer_count: data.performerCount ?? null,
        }).eq("id", id);
      } else {
        const { data: created, error } = await supabase.from("projects").insert({
          title, status, user_id: uid,
          performance_date: data.performanceDate || null,
          performer_count: data.performerCount ?? null,
        } as any).select().single();
        if (error) throw error;
        projectId = created.id;
      }
      await supabase.from("stage_inputs").upsert({ project_id: projectId!, user_id: uid, data: persistedData as any } as any);
      toast.success(isEdit ? "已更新" : "已创建");
      navigate(`/projects/${projectId}`);
    } catch (e: any) {
      toast.error("保存失败:" + e.message);
    } finally { setSaving(false); }
  }

  return (
    <div className="p-6 space-y-5 max-w-5xl">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Button asChild variant="ghost" size="sm"><Link to="/projects"><ArrowLeft className="h-4 w-4 mr-1" />返回</Link></Button>
          <h1 className="text-xl font-semibold">{isEdit ? "编辑项目" : "新建项目"}</h1>
          <span className="kbd-route">{isEdit ? "PUT /projects/:id" : "POST /projects"}</span>
        </div>
        <Button size="sm" onClick={save} disabled={saving || errors.length > 0}>{saving ? "保存中…" : errors.length > 0 ? `修正 ${errors.length} 项错误` : "保存项目"}</Button>
      </div>

      {errors.length > 0 && (
        <div className="panel border-destructive/40 bg-destructive/5">
          <div className="panel-body flex items-start gap-2 text-sm">
            <AlertCircle className="h-4 w-4 text-destructive mt-0.5" />
            <div>
              <div className="font-medium text-destructive">校验错误(阻止保存)</div>
              <ul className="mt-1 list-disc list-inside text-muted-foreground text-xs space-y-0.5">
                {errors.map((i) => <li key={i}>{i}</li>)}
              </ul>
            </div>
          </div>
        </div>
      )}

      {warnings.length > 0 && (
        <div className="panel border-warning/40 bg-warning/5">
          <div className="panel-body flex items-start gap-2 text-sm">
            <AlertTriangle className="h-4 w-4 text-warning mt-0.5" />
            <div>
              <div className="font-medium text-warning">数据校验提示</div>
              <ul className="mt-1 list-disc list-inside text-muted-foreground text-xs space-y-0.5">
                {warnings.map((i) => <li key={i}>{i}</li>)}
              </ul>
            </div>
          </div>
        </div>
      )}

      <div className="panel">
        <div className="panel-header"><h2 className="text-sm font-semibold">基本信息</h2></div>
        <div className="panel-body grid grid-cols-2 gap-4">
          <Field label="项目标题" required>
            <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="如:2026 春季合唱汇演 · 高一 3 班" />
          </Field>
          <Field label="学段">
            <Select value={data.schoolStage} onValueChange={(v) => set("schoolStage", v)}>
              <SelectTrigger><SelectValue placeholder="选择学段" /></SelectTrigger>
              <SelectContent>{SCHOOL_STAGES.map((s) => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}</SelectContent>
            </Select>
          </Field>
          <Field label="节目类型 programType">
            <Select value={data.programType} onValueChange={(v) => set("programType", v)}>
              <SelectTrigger><SelectValue placeholder="选择节目类型" /></SelectTrigger>
              <SelectContent className="max-h-72">{PROGRAM_TYPES.map((s) => <SelectItem key={s.value} value={s.value}>{s.label} · <span className="font-mono text-xs text-muted-foreground">{s.value}</span></SelectItem>)}</SelectContent>
            </Select>
          </Field>
          <Field label="节目主题">
            <Input value={data.programTheme ?? ""} onChange={(e) => set("programTheme", e.target.value)} placeholder="programTheme" />
          </Field>
          <Field label="场地类型">
            <Input value={data.venueType ?? ""} onChange={(e) => set("venueType", e.target.value)} placeholder="室内剧场 / 露天舞台 …" />
          </Field>
          <Field label="演出日期">
            <Input type="date" value={data.performanceDate ?? ""} onChange={(e) => set("performanceDate", e.target.value)} />
          </Field>
          <Field label="彩排频次(次/周)">
            <Select value={String(data.rehearsalFrequencyPerWeek ?? "")} onValueChange={(v) => set("rehearsalFrequencyPerWeek", Number(v) as 2|3|5)}>
              <SelectTrigger><SelectValue placeholder="选择彩排频次" /></SelectTrigger>
              <SelectContent>{REHEARSAL_FREQUENCIES.map((n) => <SelectItem key={n} value={String(n)}>{n} 次/周</SelectItem>)}</SelectContent>
            </Select>
          </Field>
          <Field label="项目状态">
            <Select value={status} onValueChange={setStatus}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="draft">草稿</SelectItem>
                <SelectItem value="planning">排产中</SelectItem>
                <SelectItem value="needs_revision">待修订</SelectItem>
                <SelectItem value="confirmed">已确认</SelectItem>
                <SelectItem value="exported">已导出</SelectItem>
              </SelectContent>
            </Select>
          </Field>
        </div>
      </div>

      <div className="panel">
        <div className="panel-header"><h2 className="text-sm font-semibold">人数与预算</h2></div>
        <div className="panel-body grid grid-cols-4 gap-4">
          <Field label="总人数 performerCount">
            <Input type="number" value={data.performerCount ?? ""} onChange={(e) => set("performerCount", e.target.value ? Number(e.target.value) : undefined)} />
          </Field>
          <Field label="男生数 maleCount">
            <Input type="number" value={data.maleCount ?? ""} onChange={(e) => set("maleCount", e.target.value ? Number(e.target.value) : undefined)} />
          </Field>
          <Field label="女生数 femaleCount">
            <Input type="number" value={data.femaleCount ?? ""} onChange={(e) => set("femaleCount", e.target.value ? Number(e.target.value) : undefined)} />
          </Field>
          <Field label="人均预算 (元)">
            <Input type="number" value={data.perPersonBudget ?? ""} onChange={(e) => set("perPersonBudget", e.target.value ? Number(e.target.value) : undefined)} />
          </Field>
        </div>
      </div>

      <div className="panel">
        <div className="panel-header"><h2 className="text-sm font-semibold">视觉与期待</h2></div>
        <div className="panel-body grid grid-cols-2 gap-4">
          <Field label="屏幕主题色 screenThemeColor">
            <Input value={data.screenThemeColor ?? ""} onChange={(e) => set("screenThemeColor", e.target.value)} placeholder="如:靛蓝 / #1E3A8A" />
          </Field>
          <Field label="灯光风格 lightingStyle">
            <Input value={data.lightingStyle ?? ""} onChange={(e) => set("lightingStyle", e.target.value)} placeholder="如:暖调聚光 / 冷色氛围" />
          </Field>
          <div className="col-span-2">
            <Field label="特殊期待 specialExpectation">
              <Textarea rows={2} value={data.specialExpectation ?? ""} onChange={(e) => set("specialExpectation", e.target.value)} />
            </Field>
          </div>
        </div>
      </div>

      <div className="panel">
        <div className="panel-header">
          <div className="flex items-center gap-2">
            <h2 className="text-sm font-semibold">已确认队形 confirmedFormation</h2>
            <span className="text-xs text-muted-foreground">用于渲染上下文</span>
          </div>
        </div>
        <div className="panel-body grid grid-cols-2 gap-4">
          <Field label="队形摘要 summary">
            <Input value={data.confirmedFormation?.summary ?? ""} onChange={(e) => setData((d) => ({ ...d, confirmedFormation: { ...d.confirmedFormation, summary: e.target.value } }))} />
          </Field>
          <Field label="行数 rows">
            <Input type="number" value={data.confirmedFormation?.rows ?? ""} onChange={(e) => setData((d) => ({ ...d, confirmedFormation: { ...d.confirmedFormation, rows: Number(e.target.value) || undefined } }))} />
          </Field>
          <Field label="布局名 layoutName">
            <Input value={data.confirmedFormation?.layoutName ?? ""} onChange={(e) => setData((d) => ({ ...d, confirmedFormation: { ...d.confirmedFormation, layoutName: e.target.value } }))} />
          </Field>
          <Field label="间距规则 spacingRule">
            <Input value={data.confirmedFormation?.spacingRule ?? ""} onChange={(e) => setData((d) => ({ ...d, confirmedFormation: { ...d.confirmedFormation, spacingRule: e.target.value } }))} />
          </Field>
        </div>
      </div>

      <div className="panel">
        <div className="panel-header">
          <div className="flex items-center gap-2">
            <h2 className="text-sm font-semibold">学生名录(匿名)</h2>
            <span className="text-xs text-muted-foreground">仅使用 studentId,不采集真实姓名。</span>
          </div>
          <Button variant="outline" size="sm" onClick={addStudent}><Plus className="h-3.5 w-3.5 mr-1" />添加</Button>
        </div>
        <div className="overflow-x-auto">
          <table className="ops-table">
            <thead>
              <tr>
                <th className="w-32">studentId</th><th className="w-24">gender</th>
                <th className="w-28">heightCm</th><th>roleLabel(可选)</th><th className="w-12"></th>
              </tr>
            </thead>
            <tbody>
              {(data.students ?? []).length === 0 && (
                <tr><td colSpan={5} className="text-center py-6 text-muted-foreground text-sm">
                  尚未添加。可选:添加匿名学生数据以启用尺码摸底。
                </td></tr>
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
                  <td><Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => removeStudent(i)} aria-label={`删除第 ${i + 1} 行学生`}><Trash2 className="h-3.5 w-3.5" aria-hidden="true" /><span className="sr-only">删除学生</span></Button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function Field({
  label, required, children, hint,
}: {
  label: string;
  required?: boolean;
  children: React.ReactNode;
  hint?: { errors: string[]; warnings: string[] };
}) {
  const hasErr = (hint?.errors.length ?? 0) > 0;
  const hasWarn = (hint?.warnings.length ?? 0) > 0;
  return (
    <div className="space-y-1.5">
      <Label className={`text-xs ${hasErr ? "text-destructive" : hasWarn ? "text-warning" : "text-muted-foreground"}`}>
        {label}{required && <span className="text-destructive ml-0.5">*</span>}
      </Label>
      {children}
      {hasErr && (
        <ul className="text-[11px] text-destructive space-y-0.5">
          {hint!.errors.map((m) => <li key={`e-${m}`}>• {m}</li>)}
        </ul>
      )}
      {hasWarn && (
        <ul className="text-[11px] text-warning space-y-0.5">
          {hint!.warnings.map((m) => <li key={`w-${m}`}>• {m}</li>)}
        </ul>
      )}
    </div>
  );
}

