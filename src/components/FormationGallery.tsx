// 插画风队形模板图库：按节目类型自动匹配队形族横幅，也可浏览全部模板。
// 内置模板即时可看；「AI 生成专属图」调用百炼 wan2.7-image 按项目参数实时绘制。
import { useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { familyForProgramType, allFamilies } from "@/lib/formationGallery";
import type { StageInputData } from "@/lib/stageos";
import { PROGRAM_TYPES } from "@/lib/stageos";

type AiState =
  | { phase: "idle" }
  | { phase: "loading" }
  | { phase: "done"; url: string }
  | { phase: "error"; message: string };

export function FormationGallery({
  projectId,
  input,
}: {
  projectId: string;
  input: StageInputData;
}) {
  const matched = useMemo(() => familyForProgramType(input.programType), [input.programType]);
  const [activeKey, setActiveKey] = useState(matched.key);
  const [ai, setAi] = useState<AiState>({ phase: "idle" });
  const families = allFamilies();
  const active = families.find((f) => f.key === activeKey) ?? matched;
  const programLabel =
    PROGRAM_TYPES.find((t) => t.value === input.programType)?.label ?? "未设置节目类型";

  async function generateAiImage() {
    setAi({ phase: "loading" });
    try {
      const res = await supabase.functions.invoke("ai-generate-formation-image", {
        body: { projectId },
      });
      const data = (res.data ?? null) as
        | { ok?: boolean; imageUrl?: string; message?: string; code?: string }
        | null;
      if (res.error) {
        // supabase-js 对非 2xx 抛 error，但响应体可能带业务信息
        let message = "AI 生成失败，请稍后重试。";
        try {
          const ctx = (res.error as { context?: Response }).context;
          if (ctx) {
            const body = await ctx.json();
            message = body?.message ?? message;
          }
        } catch {
          /* 保持默认提示 */
        }
        setAi({ phase: "error", message });
        return;
      }
      if (data?.ok && data.imageUrl) {
        setAi({ phase: "done", url: data.imageUrl });
      } else {
        setAi({ phase: "error", message: data?.message ?? "AI 未返回图片，请稍后重试。" });
      }
    } catch (e) {
      setAi({ phase: "error", message: (e as Error).message ?? "网络异常，请稍后重试。" });
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-muted-foreground text-pretty">
          节目类型「{programLabel}」已自动匹配
          <span className="mx-1 font-medium text-foreground">{matched.title}</span>
          ，也可以浏览其他队形族模板。
        </p>
        <div className="flex items-center gap-2">
          <span className="rounded-full liquid-glass px-3 py-1 text-xs text-muted-foreground">
            内置模板即时可用
          </span>
          <button
            type="button"
            onClick={generateAiImage}
            disabled={ai.phase === "loading"}
            className="rounded-full bg-primary px-4 py-1.5 text-xs font-medium text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-50"
          >
            {ai.phase === "loading" ? "AI 绘制中（约 1 分钟）…" : "AI 生成专属图"}
          </button>
        </div>
      </div>

      {ai.phase === "error" ? (
        <div className="rounded-xl border border-destructive/40 bg-destructive/10 p-3 text-xs text-destructive">
          {ai.message}
        </div>
      ) : null}

      {ai.phase === "done" ? (
        <figure className="liquid-glass overflow-hidden rounded-[1.25rem] ring-1 ring-primary/40">
          <img
            src={ai.url || "/placeholder.svg"}
            alt="AI 按项目参数生成的专属队形插画"
            className="w-full bg-white object-contain"
          />
          <figcaption className="flex flex-wrap items-center justify-between gap-2 p-3 text-xs text-muted-foreground">
            <span>
              <span className="mr-2 font-medium text-foreground">AI 专属队形插画</span>
              按本项目学段、节目类型、人数与已确认队形实时生成
            </span>
            <span className="flex items-center gap-3">
              <a
                href={ai.url}
                target="_blank"
                rel="noreferrer"
                className="underline underline-offset-2 hover:text-foreground"
              >
                查看原图
              </a>
              <button
                type="button"
                onClick={generateAiImage}
                className="underline underline-offset-2 hover:text-foreground"
              >
                重新生成
              </button>
            </span>
          </figcaption>
        </figure>
      ) : null}

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
        注：插画为示意图，实际站位请以「俯视图」与现场排练为准。AI 生成图片链接约 24
        小时有效，请及时保存。
      </p>
    </div>
  );
}
