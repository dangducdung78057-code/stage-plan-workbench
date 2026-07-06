// 插画风队形模板图库：按节目类型自动匹配队形族横幅，也可浏览全部模板。
// 试用期内置静态模板；付费版将开放按项目参数实时 AI 生成专属插画。
import { useMemo, useState } from "react";
import { familyForProgramType, allFamilies } from "@/lib/formationGallery";
import type { StageInputData } from "@/lib/stageos";
import { PROGRAM_TYPES } from "@/lib/stageos";

export function FormationGallery({ input }: { input: StageInputData }) {
  const matched = useMemo(() => familyForProgramType(input.programType), [input.programType]);
  const [activeKey, setActiveKey] = useState(matched.key);
  const families = allFamilies();
  const active = families.find((f) => f.key === activeKey) ?? matched;
  const programLabel =
    PROGRAM_TYPES.find((t) => t.value === input.programType)?.label ?? "未设置节目类型";

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-muted-foreground text-pretty">
          节目类型「{programLabel}」已自动匹配
          <span className="mx-1 font-medium text-foreground">{matched.title}</span>
          ，也可以浏览其他队形族模板。
        </p>
        <span className="rounded-full liquid-glass px-3 py-1 text-xs text-muted-foreground">
          试用版·内置模板 | 正式版将开放 AI 专属生成
        </span>
      </div>

      <div className="flex flex-wrap gap-2" role="tablist" aria-label="队形族模板">
        {families.map((f) => (
          <button
            key={f.key}
            type="button"
            role="tab"
            aria-selected={f.key === active.key}
            onClick={() => setActiveKey(f.key)}
            className={`rounded-full px-3 py-1.5 text-xs transition-colors liquid-glass ${
              f.key === active.key
                ? "bg-white/15 font-medium"
                : "text-muted-foreground hover:text-foreground"
            } ${f.key === matched.key ? "ring-1 ring-primary/40" : ""}`}
          >
            {f.title.replace("队形模板", "").replace("走位模板", "")}
            {f.key === matched.key ? " ·匹配" : ""}
          </button>
        ))}
      </div>

      <figure className="liquid-glass overflow-hidden rounded-[1.25rem]">
        <img
          src={active.image || "/placeholder.svg"}
          alt={`${active.title}：${active.caption}`}
          className="w-full bg-white object-contain"
          loading="lazy"
        />
        <figcaption className="flex flex-wrap items-center gap-2 p-3 text-xs text-muted-foreground">
          <span className="font-medium text-foreground">{active.title}</span>
          <span className="text-pretty">{active.caption}</span>
        </figcaption>
      </figure>

      <div className="grid gap-2 sm:grid-cols-3">
        {active.phases.map((p, i) => (
          <div key={p} className="liquid-glass rounded-xl p-3 text-xs">
            <span className="mr-2 inline-flex h-5 w-5 items-center justify-center rounded-full bg-white/10 font-medium">
              {i + 1}
            </span>
            {p}
          </div>
        ))}
      </div>

      <p className="text-xs text-muted-foreground text-pretty">
        注：模板为示意插画，实际站位请以「俯视图」与现场排练为准。
      </p>
    </div>
  );
}
