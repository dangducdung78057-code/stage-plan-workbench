// 队形与舞台走位工作区:方案切换 + SVG 舞台可视化 + 走位口令 + 确认保存。
import { useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { Users, Save, CheckCircle2, Footprints } from "lucide-react";
import {
  generateFormations, summarizeFormation,
  type FormationScheme, type FormationSlot,
} from "@/lib/formation";
import type { StageInputData } from "@/lib/stageos";

const GROUP_COLORS: Record<FormationSlot["group"], { fill: string; label: string }> = {
  A: { fill: "hsl(210 80% 62%)", label: "声部 A / 主体" },
  B: { fill: "hsl(340 70% 64%)", label: "声部 B" },
  conductor: { fill: "hsl(45 90% 60%)", label: "指挥" },
};

function StageCanvas({ scheme }: { scheme: FormationScheme }) {
  const hasB = scheme.slots.some((s) => s.group === "B");
  const hasConductor = scheme.slots.some((s) => s.group === "conductor");
  return (
    <div className="space-y-2">
      <svg viewBox="0 0 100 108" className="w-full rounded-xl border border-border/60 bg-black/40" role="img" aria-label={`${scheme.name}队形示意图`}>
        {/* 舞台后幕 */}
        <rect x="2" y="4" width="96" height="6" rx="2" fill="hsl(0 0% 100% / 0.06)" />
        <text x="50" y="8.6" textAnchor="middle" fontSize="3.2" fill="hsl(0 0% 100% / 0.45)">舞台后沿 · 背景屏</text>
        {/* 台口线 */}
        <line x1="4" y1="98" x2="96" y2="98" stroke="hsl(0 0% 100% / 0.25)" strokeWidth="0.4" strokeDasharray="2 1.4" />
        <text x="50" y="104.5" textAnchor="middle" fontSize="3.2" fill="hsl(0 0% 100% / 0.45)">台口 · 观众席方向 ↓</text>
        {/* 中线参考 */}
        <line x1="50" y1="12" x2="50" y2="96" stroke="hsl(0 0% 100% / 0.08)" strokeWidth="0.3" />
        {/* 队员点位 */}
        {scheme.slots.map((slot, i) => (
          <g key={i}>
            <circle
              cx={slot.x}
              cy={slot.y + 10}
              r={slot.group === "conductor" ? 2.6 : 2.1}
              fill={GROUP_COLORS[slot.group].fill}
              opacity={slot.gender === "male" && slot.group !== "conductor" ? 0.75 : 1}
              stroke={slot.gender === "male" ? "hsl(0 0% 100% / 0.9)" : "none"}
              strokeWidth={slot.gender === "male" ? 0.4 : 0}
            />
            {slot.studentId ? (
              <text x={slot.x} y={slot.y + 14.6} textAnchor="middle" fontSize="2" fill="hsl(0 0% 100% / 0.55)">
                {slot.studentId}
              </text>
            ) : null}
          </g>
        ))}
      </svg>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
        <span className="inline-flex items-center gap-1.5">
          <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ background: GROUP_COLORS.A.fill }} />
          {hasB ? GROUP_COLORS.A.label : "队员"}
        </span>
        {hasB ? (
          <span className="inline-flex items-center gap-1.5">
            <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ background: GROUP_COLORS.B.fill }} />
            {GROUP_COLORS.B.label}
          </span>
        ) : null}
        {hasConductor ? (
          <span className="inline-flex items-center gap-1.5">
            <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ background: GROUP_COLORS.conductor.fill }} />
            {GROUP_COLORS.conductor.label}
          </span>
        ) : null}
        <span className="inline-flex items-center gap-1.5">
          <span className="inline-block h-2.5 w-2.5 rounded-full border border-white/80" style={{ background: GROUP_COLORS.A.fill, opacity: 0.75 }} />
          白边 = 男生
        </span>
      </div>
    </div>
  );
}

export function FormationWorkspace({
  projectId, input, onSaved,
}: {
  projectId: string;
  input: StageInputData | null;
  onSaved: () => void;
}) {
  const schemes = useMemo(() => (input ? generateFormations(input) : []), [input]);
  const [activeKey, setActiveKey] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const active = schemes.find((s) => s.key === activeKey) ?? schemes[0];
  const confirmed = input?.confirmedFormation;

  async function confirmScheme(scheme: FormationScheme) {
    if (!input) return;
    setSaving(true);
    try {
      const { data: userData } = await supabase.auth.getUser();
      const uid = userData.user?.id;
      if (!uid) { toast.error("未登录"); return; }
      const next: StageInputData = {
        ...input,
        confirmedFormation: summarizeFormation(scheme, input),
      };
      const { error } = await supabase
        .from("stage_inputs")
        .upsert({ project_id: projectId, user_id: uid, data: next as any } as any);
      if (error) throw error;
      toast.success(`已确认队形:${scheme.name}`);
      onSaved();
    } catch (e: any) {
      toast.error("保存失败:" + e.message);
    } finally {
      setSaving(false);
    }
  }

  if (!input || schemes.length === 0) {
    return (
      <div className="liquid-glass rounded-[1.25rem] p-6 text-sm text-muted-foreground">
        <Users className="mb-2 h-5 w-5" aria-hidden="true" />
        暂无可用的队形数据 — 请先在「编辑 StageInput」中填写总人数(或学生名单),再回到此处生成队形方案。
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {confirmed?.layoutName ? (
        <div className="liquid-glass flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm">
          <CheckCircle2 className="h-4 w-4 text-success" aria-hidden="true" />
          <span className="text-muted-foreground">已确认队形:</span>
          <span className="font-medium">{confirmed.summary ?? confirmed.layoutName}</span>
        </div>
      ) : null}

      {/* 方案切换 */}
      <div className="flex flex-wrap gap-2">
        {schemes.map((s) => (
          <button
            key={s.key}
            type="button"
            onClick={() => setActiveKey(s.key)}
            className={`rounded-full px-4 py-1.5 text-sm transition-colors ${
              active?.key === s.key
                ? "liquid-glass-strong font-medium"
                : "liquid-glass text-muted-foreground hover:text-foreground"
            }`}
            aria-pressed={active?.key === s.key}
          >
            {s.name}
          </button>
        ))}
      </div>

      {active ? (
        <div className="grid gap-4 lg:grid-cols-[1.4fr_1fr]">
          <div className="liquid-glass rounded-[1.25rem] p-4">
            <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
              <div>
                <h3 className="font-medium">{active.name}</h3>
                <p className="text-xs text-muted-foreground">{active.suitedFor}</p>
              </div>
              <span className="text-xs text-muted-foreground">
                {active.slots.filter((s) => s.group !== "conductor").length} 人 · {active.rows} 排 · {active.spacingRule}
              </span>
            </div>
            <StageCanvas scheme={active} />
          </div>

          <div className="space-y-4">
            <div className="liquid-glass rounded-[1.25rem] p-4">
              <h4 className="mb-2 flex items-center gap-1.5 text-sm font-medium">
                <Footprints className="h-4 w-4" aria-hidden="true" /> 走位口令
              </h4>
              <ol className="space-y-2 text-sm">
                {active.movementCues.map((c, i) => (
                  <li key={i} className="flex gap-2">
                    <span className="shrink-0 rounded-md bg-white/10 px-1.5 py-0.5 text-xs text-muted-foreground">{c.phase}</span>
                    <span className="text-muted-foreground">{c.cue}</span>
                  </li>
                ))}
              </ol>
            </div>
            <div className="liquid-glass rounded-[1.25rem] p-4">
              <h4 className="mb-2 text-sm font-medium">排布要点</h4>
              <ul className="list-disc space-y-1.5 pl-4 text-sm text-muted-foreground">
                {active.notes.map((n, i) => <li key={i}>{n}</li>)}
              </ul>
            </div>
            <Button
              className="w-full"
              disabled={saving}
              onClick={() => confirmScheme(active)}
            >
              <Save className="mr-1.5 h-4 w-4" aria-hidden="true" />
              {saving ? "保存中..." : `确认使用「${active.name}」`}
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
