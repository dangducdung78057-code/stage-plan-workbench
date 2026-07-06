// 正面朝向的「2D 形象预览图」示意模板:仿纸质排产单版式。
// 中央为室内舞台正视图(台阶分层 + 2D 简笔人物 + 编号/身高标签),
// 左栏表演信息与图例,右栏队形/服装/舞台灯光建议与参考参数,底部签字栏。
// 纯内联 SVG,可无损导出 PNG。
import { useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { Download } from "lucide-react";
import { localizeEnum } from "@/lib/exportRender";
import type { FormationScheme, FormationSlot } from "@/lib/formation";
import type { StageInputData } from "@/lib/stageos";

const VIEW_W = 1480;
const VIEW_H = 1060;

// ---------- 版式配色(印刷风,固定亮色,不随应用主题) ----------
const INK = "#26221c";
const MUTED = "#7a7264";
const PANEL_BORDER = "#e2dcd0";
const PANEL_BG = "#fbf9f4";
const CHIP_BG = "#ffffff";
const WALL = "#f6ecdc";
const WALL_DARK = "#eaddc4";
const PILLAR = "#c89a66";
const PILLAR_DARK = "#a97e4e";
const FLOOR = "#d8b488";
const FLOOR_LINE = "#c6a071";
const RISER = "#f0e5cf";
const RISER_FACE = "#e2d3b4";

// 人物配色
const SKIN = "#f3d3b3";
const HAIR = "#2f2a28";
const BOY_SHIRT = "#f4f7fb";
const BOY_TIE = "#7396c8";
const BOY_PANTS = "#8a94a6";
const GIRL_DRESS = "#f4b8c1";
const GIRL_DRESS_B = "#f7e3b8"; // 声部 B 备用色
const CONDUCTOR_DRESS = "#e8c65a";
const SHOE = "#5b5148";

type SheetSlot = FormationSlot & { label: string };

/** 排序 + 编号:后排(row 1)优先、行内从左到右;无学号时补 S01…。 */
function numberedSlots(scheme: FormationScheme): { members: SheetSlot[]; conductor?: SheetSlot } {
  const members = scheme.slots
    .filter((s) => s.group !== "conductor")
    .sort((a, b) => (a.row - b.row) || (a.x - b.x))
    .map((s, i) => ({ ...s, label: s.studentId || `S${String(i + 1).padStart(2, "0")}` }));
  const c = scheme.slots.find((s) => s.group === "conductor");
  return { members, conductor: c ? { ...c, label: "指挥" } : undefined };
}

/** 简笔人物(正面)。h = 人物像素高,baseY = 脚底 y。 */
function Figure({ x, baseY, h, slot }: { x: number; baseY: number; h: number; slot: SheetSlot }) {
  const headR = h * 0.115;
  const headCy = baseY - h + headR;
  const neckY = headCy + headR * 0.92;
  const torsoH = h * 0.34;
  const legH = baseY - (neckY + torsoH);
  const shoulder = h * 0.17;
  const isBoy = slot.gender === "male";
  const isConductor = slot.group === "conductor";
  const dress = isConductor ? CONDUCTOR_DRESS : slot.group === "B" ? GIRL_DRESS_B : GIRL_DRESS;

  return (
    <g>
      {/* 阴影 */}
      <ellipse cx={x} cy={baseY + 2} rx={h * 0.14} ry={h * 0.028} fill="#00000018" />
      {isBoy ? (
        <>
          {/* 裤腿 */}
          <rect x={x - shoulder * 0.52} y={neckY + torsoH - 2} width={shoulder * 0.45} height={legH + 2} rx={2} fill={BOY_PANTS} />
          <rect x={x + shoulder * 0.07} y={neckY + torsoH - 2} width={shoulder * 0.45} height={legH + 2} rx={2} fill={BOY_PANTS} />
          {/* 衬衫 */}
          <path d={`M ${x - shoulder} ${neckY + 3} Q ${x} ${neckY - 2} ${x + shoulder} ${neckY + 3} L ${x + shoulder * 0.62} ${neckY + torsoH} L ${x - shoulder * 0.62} ${neckY + torsoH} Z`} fill={BOY_SHIRT} stroke="#d7dee9" strokeWidth={0.8} />
          {/* 领带 */}
          <path d={`M ${x} ${neckY + 2} l ${h * 0.022} ${h * 0.03} l ${-h * 0.022} ${torsoH * 0.72} l ${-h * 0.022} ${-torsoH * 0.72} Z`} fill={BOY_TIE} />
          {/* 手臂 */}
          <rect x={x - shoulder - 2.5} y={neckY + 5} width={4} height={torsoH * 0.88} rx={2} fill={BOY_SHIRT} stroke="#d7dee9" strokeWidth={0.6} />
          <rect x={x + shoulder - 1.5} y={neckY + 5} width={4} height={torsoH * 0.88} rx={2} fill={BOY_SHIRT} stroke="#d7dee9" strokeWidth={0.6} />
        </>
      ) : (
        <>
          {/* 腿 */}
          <rect x={x - shoulder * 0.34} y={baseY - legH * 0.62} width={shoulder * 0.3} height={legH * 0.62} fill={SKIN} />
          <rect x={x + shoulder * 0.06} y={baseY - legH * 0.62} width={shoulder * 0.3} height={legH * 0.62} fill={SKIN} />
          {/* 连衣裙(A 字) */}
          <path d={`M ${x - shoulder * 0.85} ${neckY + 3} Q ${x} ${neckY - 2} ${x + shoulder * 0.85} ${neckY + 3} L ${x + shoulder * 1.35} ${baseY - legH * 0.5} Q ${x} ${baseY - legH * 0.4} ${x - shoulder * 1.35} ${baseY - legH * 0.5} Z`} fill={dress} stroke="#00000012" strokeWidth={0.6} />
          {/* 手臂 */}
          <rect x={x - shoulder - 1.8} y={neckY + 5} width={3.6} height={torsoH * 0.82} rx={1.8} fill={SKIN} />
          <rect x={x + shoulder - 1.8} y={neckY + 5} width={3.6} height={torsoH * 0.82} rx={1.8} fill={SKIN} />
          {/* 领结 */}
          <circle cx={x} cy={neckY + 4.5} r={h * 0.018} fill="#e05d7a" />
        </>
      )}
      {/* 鞋 */}
      <rect x={x - shoulder * 0.6} y={baseY - 3} width={shoulder * 0.5} height={3.5} rx={1.5} fill={SHOE} />
      <rect x={x + shoulder * 0.1} y={baseY - 3} width={shoulder * 0.5} height={3.5} rx={1.5} fill={SHOE} />
      {/* 头 */}
      <circle cx={x} cy={headCy} r={headR} fill={SKIN} />
      {isBoy ? (
        <path d={`M ${x - headR} ${headCy} A ${headR} ${headR} 0 0 1 ${x + headR} ${headCy} L ${x + headR * 0.8} ${headCy - headR * 0.25} Q ${x} ${headCy - headR * 0.65} ${x - headR * 0.8} ${headCy - headR * 0.25} Z`} fill={HAIR} />
      ) : (
        <>
          <path d={`M ${x - headR} ${headCy + headR * 0.15} A ${headR} ${headR} 0 0 1 ${x + headR} ${headCy + headR * 0.15} L ${x + headR * 0.92} ${headCy - headR * 0.1} Q ${x} ${headCy - headR * 0.75} ${x - headR * 0.92} ${headCy - headR * 0.1} Z`} fill={HAIR} />
          <rect x={x - headR * 1.02} y={headCy} width={headR * 0.34} height={headR * 1.5} rx={headR * 0.17} fill={HAIR} />
          <rect x={x + headR * 0.68} y={headCy} width={headR * 0.34} height={headR * 1.5} rx={headR * 0.17} fill={HAIR} />
        </>
      )}
    </g>
  );
}

/** 编号 + 身高标签(人物头顶)。 */
function LabelChip({ x, y, slot }: { x: number; y: number; slot: SheetSlot }) {
  const hasHeight = typeof slot.heightCm === "number";
  const w = 52;
  const h = hasHeight ? 28 : 18;
  return (
    <g>
      <rect x={x - w / 2} y={y - h} width={w} height={h} rx={4} fill={CHIP_BG} stroke={PANEL_BORDER} strokeWidth={1} />
      <text x={x} y={y - h + 12} textAnchor="middle" fontSize={11} fontWeight={700} fill={INK}>{slot.label}</text>
      {hasHeight ? (
        <text x={x} y={y - 4} textAnchor="middle" fontSize={9.5} fill={MUTED}>{slot.heightCm}cm</text>
      ) : null}
    </g>
  );
}

/** 盆栽装饰。 */
function Plant({ x, y }: { x: number; y: number }) {
  return (
    <g>
      <rect x={x - 14} y={y - 22} width={28} height={22} rx={3} fill="#eef0ee" stroke="#d8dbd6" />
      <ellipse cx={x - 8} cy={y - 34} rx={10} ry={14} fill="#4e7d4a" />
      <ellipse cx={x + 8} cy={y - 36} rx={10} ry={15} fill="#5d9155" />
      <ellipse cx={x} cy={y - 44} rx={9} ry={14} fill="#6aa25f" />
    </g>
  );
}

/** 左/右栏的小节框。返回内容底部 y 以便下一节续排。 */
function PanelSection({ x, y, w, title, lines, lineH = 17 }: {
  x: number; y: number; w: number; title: string; lines: string[]; lineH?: number;
}) {
  const h = 30 + lines.length * lineH + 8;
  return (
    <g>
      <rect x={x} y={y} width={w} height={h} rx={8} fill={PANEL_BG} stroke={PANEL_BORDER} />
      <rect x={x} y={y} width={w} height={24} rx={8} fill="#efe9dc" />
      <rect x={x} y={y + 16} width={w} height={8} fill="#efe9dc" />
      <text x={x + 10} y={y + 16.5} fontSize={12.5} fontWeight={700} fill={INK}>{title}</text>
      {lines.map((line, i) => (
        <text key={i} x={x + 10} y={y + 40 + i * lineH} fontSize={10.8} fill={line.startsWith("·") || line.startsWith("•") ? MUTED : INK}>
          {line}
        </text>
      ))}
    </g>
  );
}

function sectionHeight(lineCount: number, lineH = 17): number {
  return 30 + lineCount * lineH + 8 + 10;
}

/** 文本按宽度粗略折行(中文按字数)。 */
function wrap(text: string, chars: number): string[] {
  const out: string[] = [];
  let rest = text;
  while (rest.length > chars) {
    out.push(rest.slice(0, chars));
    rest = rest.slice(chars);
  }
  if (rest) out.push(rest);
  return out;
}

export function FormationPreviewSheet({
  scheme, input, projectTitle,
}: {
  scheme: FormationScheme;
  input: StageInputData;
  projectTitle?: string;
}) {
  const svgRef = useRef<SVGSVGElement>(null);
  const [exporting, setExporting] = useState(false);

  const { members, conductor } = useMemo(() => numberedSlots(scheme), [scheme]);
  const maleCount = members.filter((m) => m.gender === "male").length;
  const femaleCount = members.length - maleCount;

  // ---------- 舞台布局(正视图) ----------
  const stage = { x: 292, y: 96, w: 896, h: 856 };
  const wallBottom = stage.y + 596;
  const rows = scheme.rows;
  // 每排基线:row 1(最后排)最高(站在最高台阶),向前逐排降低
  const rowGap = rows > 1 ? Math.min(118, 330 / (rows - 1) + 40) : 0;
  const backBase = stage.y + 316;
  const baseYFor = (row: number) => backBase + (row - 1) * rowGap;
  // 人物高度:前排更大(近大远小),身高按 cm 相对缩放
  const figureH = (row: number, heightCm?: number) => {
    const perspective = 0.86 + ((row - 1) / Math.max(1, rows - 1)) * 0.22;
    const hcm = Math.min(185, Math.max(120, heightCm ?? 152));
    return (hcm / 152) * 118 * perspective;
  };
  // x: 0-100 → 舞台内部像素(两侧留柱子)
  const px = (x: number) => stage.x + 66 + (x / 100) * (stage.w - 132);

  const byRow: Record<number, SheetSlot[]> = {};
  for (const m of members) (byRow[m.row] ??= []).push(m);

  const themeLabel = input.programTheme ? String(localizeEnum(input.programTheme)) : "未填写";
  const typeLabel = input.programType ? String(localizeEnum(input.programType)) : "未填写";
  const stageLabel = input.schoolStage ? String(localizeEnum(input.schoolStage)) : "未填写";
  const freq = input.rehearsalFrequencyPerWeek;
  const budget = input.perPersonBudget;
  const dateStr = new Date().toLocaleDateString("zh-CN");
  const coreIds = members.length >= 3
    ? `${members[0].label}、${members[Math.floor(members.length / 2)].label}、${members[members.length - 1].label}`
    : members.map((m) => m.label).join("、");

  // ---------- 左栏内容 ----------
  const leftX = 18, colW = 258;
  const infoLines = [
    `男:${maleCount} 人  女:${femaleCount} 人  共 ${members.length} 人`,
    `节目类型:${typeLabel}`,
    `学段:${stageLabel}`,
    ...wrap(`节目主题:${themeLabel}`, 13),
    `演出日期:${input.performanceDate ?? "未定"}`,
    `排练频率:${freq ? `${freq} 次/周` : "未填写"}`,
    `人均预算:${budget ? `${budget} 元` : "未填写"}`,
    `确认队形:${input.confirmedFormation?.layoutName === scheme.name ? "☑ 已确认" : "☐ 待确认"}`,
  ];

  // ---------- 右栏内容 ----------
  const rightX = VIEW_W - colW - 18;
  const designLines = [
    `• 队形:${scheme.name}(${rows} 排)`,
    ...scheme.notes.flatMap((n) => wrap(`• ${n}`, 15)),
    ...wrap(`• 核心位置:${coreIds}`, 15),
  ];
  const lightLines = [
    "• 背景:浅木色/米白墙面",
    "  (简洁干净,突出人物)",
    "• 地面:木质舞台地板",
    "• 灯光:暖面光为主光源",
    "  (均匀照明,避免杂色彩光)",
  ];
  const paramLines = [
    ...wrap(`• ${scheme.spacingRule}`, 15),
    "• 安全边界:距台口 ≥ 1m",
    "• 舞台朝向:↑(正面朝上)",
  ];

  async function exportPng() {
    const svg = svgRef.current;
    if (!svg) return;
    setExporting(true);
    try {
      const xml = new XMLSerializer().serializeToString(svg);
      const blob = new Blob([xml], { type: "image/svg+xml;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const img = new Image();
      await new Promise<void>((res, rej) => {
        img.onload = () => res();
        img.onerror = () => rej(new Error("SVG 渲染失败"));
        img.src = url;
      });
      const scale = 2;
      const canvas = document.createElement("canvas");
      canvas.width = VIEW_W * scale;
      canvas.height = VIEW_H * scale;
      const ctx = canvas.getContext("2d")!;
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      URL.revokeObjectURL(url);
      const png = await new Promise<Blob | null>((res) => canvas.toBlob(res, "image/png"));
      if (!png) throw new Error("PNG 编码失败");
      const a = document.createElement("a");
      a.href = URL.createObjectURL(png);
      a.download = `2D形象预览图-${scheme.name}-${dateStr}.png`;
      a.click();
      URL.revokeObjectURL(a.href);
      toast.success("已导出 2D 形象预览图 PNG");
    } catch (e: any) {
      toast.error("导出失败:" + e.message);
    } finally {
      setExporting(false);
    }
  }

  // 台阶平台(从最后排到第 2 排,每排一级;第 1 排常为地面)
  const risers = Array.from({ length: Math.max(0, rows - 1) }, (_, i) => {
    const row = i + 1; // 后排在最高台阶
    const topY = baseYFor(row);
    const depth = rowGap * 0.92;
    const inset = 40 + i * 26;
    return { x: stage.x + inset, w: stage.w - inset * 2, y: topY, h: depth };
  });

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs text-muted-foreground">正面朝向 · 人物为 2D 形象示意,实际站位请以现场排练为准</p>
        <Button size="sm" variant="secondary" onClick={exportPng} disabled={exporting}>
          <Download className="mr-1.5 h-4 w-4" aria-hidden="true" />
          {exporting ? "导出中..." : "导出 PNG"}
        </Button>
      </div>

      <div className="overflow-auto rounded-xl border border-border/60 bg-white">
        <svg
          ref={svgRef}
          viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
          className="min-w-[900px] w-full"
          role="img"
          aria-label={`${scheme.name} 2D 形象预览图`}
          xmlns="http://www.w3.org/2000/svg"
          fontFamily="'PingFang SC','Microsoft YaHei',sans-serif"
        >
          <rect width={VIEW_W} height={VIEW_H} fill="#ffffff" />
          <rect x={6} y={6} width={VIEW_W - 12} height={VIEW_H - 12} rx={14} fill="none" stroke={PANEL_BORDER} strokeWidth={2} />

          {/* 标题 */}
          <text x={VIEW_W / 2} y={52} textAnchor="middle" fontSize={30} fontWeight={800} fill={INK}>
            {"—◆ "}室内表演 2D 形象预览图(示意模板){" ◆—"}
          </text>

          {/* ===== 中央舞台 ===== */}
          <g>
            {/* 墙面 */}
            <rect x={stage.x} y={stage.y} width={stage.w} height={wallBottom - stage.y} fill={WALL} />
            <rect x={stage.x} y={stage.y} width={stage.w} height={26} fill={WALL_DARK} />
            {/* 两侧木柱 */}
            <rect x={stage.x} y={stage.y} width={44} height={stage.h} fill={PILLAR} />
            <rect x={stage.x + 34} y={stage.y} width={10} height={stage.h} fill={PILLAR_DARK} />
            <rect x={stage.x + stage.w - 44} y={stage.y} width={44} height={stage.h} fill={PILLAR} />
            <rect x={stage.x + stage.w - 44} y={stage.y} width={10} height={stage.h} fill={PILLAR_DARK} />
            {/* 地板 */}
            <rect x={stage.x + 44} y={wallBottom} width={stage.w - 88} height={stage.y + stage.h - wallBottom} fill={FLOOR} />
            {Array.from({ length: 7 }, (_, i) => (
              <line key={i} x1={stage.x + 44} y1={wallBottom + 34 + i * 32} x2={stage.x + stage.w - 44} y2={wallBottom + 34 + i * 32} stroke={FLOOR_LINE} strokeWidth={1} opacity={0.6} />
            ))}
            {/* 台阶(后排最高) */}
            {risers.map((r, i) => (
              <g key={i}>
                <rect x={r.x} y={r.y} width={r.w} height={r.h} rx={4} fill={RISER} stroke={RISER_FACE} />
                <rect x={r.x} y={r.y + r.h - 10} width={r.w} height={10} rx={3} fill={RISER_FACE} />
              </g>
            ))}
            {/* 表演活动范围(参考) */}
            <ellipse cx={(stage.x + stage.w / 2)} cy={wallBottom + 128} rx={330} ry={82} fill="none" stroke="#ffffff" strokeWidth={2.5} strokeDasharray="10 8" opacity={0.9} />
            {/* 盆栽 */}
            <Plant x={stage.x + 92} y={wallBottom + 10} />
            <Plant x={stage.x + stage.w - 92} y={wallBottom + 10} />
            {/* 视图标签 */}
            <rect x={stage.x + stage.w / 2 - 130} y={stage.y + 10} width={260} height={32} rx={8} fill="#ffffff" stroke={PANEL_BORDER} />
            <text x={stage.x + stage.w / 2} y={stage.y + 32} textAnchor="middle" fontSize={15} fontWeight={700} fill={INK}>
              2D 形象预览图(正面朝向)
            </text>

            {/* 人物:先画后排再画前排(前排遮挡后排) */}
            {Array.from({ length: rows }, (_, ri) => ri + 1).map((row) =>
              (byRow[row] ?? []).map((slot) => {
                const x = px(slot.x);
                const baseY = baseYFor(row);
                const h = figureH(row, slot.heightCm);
                return (
                  <g key={slot.label}>
                    <LabelChip x={x} y={baseY - h - 6} slot={slot} />
                    <Figure x={x} baseY={baseY} h={h} slot={slot} />
                  </g>
                );
              })
            )}
            {/* 指挥(台口中央) */}
            {conductor ? (
              <g>
                <LabelChip x={stage.x + stage.w / 2} y={wallBottom + 196 - 128 - 6} slot={conductor} />
                <Figure x={stage.x + stage.w / 2} baseY={wallBottom + 196} h={128} slot={conductor} />
              </g>
            ) : null}
            {/* 底注 */}
            <text x={stage.x + 54} y={stage.y + stage.h - 14} fontSize={11} fill="#8a7a5f">
              注:人物为 2D 形象示意,实际站位请以现场排练为准。
            </text>
          </g>

          {/* ===== 左栏 ===== */}
          <PanelSection x={leftX} y={96} w={colW} title="表演信息" lines={infoLines} />
          {(() => {
            const y2 = 96 + sectionHeight(infoLines.length);
            const legendY = y2;
            return (
              <g>
                <rect x={leftX} y={legendY} width={colW} height={190} rx={8} fill={PANEL_BG} stroke={PANEL_BORDER} />
                <rect x={leftX} y={legendY} width={colW} height={24} rx={8} fill="#efe9dc" />
                <rect x={leftX} y={legendY + 16} width={colW} height={8} fill="#efe9dc" />
                <text x={leftX + 10} y={legendY + 16.5} fontSize={12.5} fontWeight={700} fill={INK}>图例说明</text>
                {/* 男生示例 */}
                <Figure x={leftX + 26} baseY={legendY + 84} h={44} slot={{ x: 0, y: 0, row: 1, col: 1, gender: "male", group: "A", label: "" }} />
                <text x={leftX + 52} y={legendY + 68} fontSize={11.5} fill={INK}>男生({maleCount} 人)</text>
                {/* 女生示例 */}
                <Figure x={leftX + 26} baseY={legendY + 140} h={44} slot={{ x: 0, y: 0, row: 1, col: 1, gender: "female", group: "A", label: "" }} />
                <text x={leftX + 52} y={legendY + 124} fontSize={11.5} fill={INK}>女生({femaleCount} 人)</text>
                {/* 台阶/范围 */}
                <rect x={leftX + 12} y={legendY + 156} width={28} height={9} rx={2} fill={RISER} stroke={RISER_FACE} />
                <text x={leftX + 52} y={legendY + 164} fontSize={11.5} fill={INK}>层次台阶(示意)</text>
                <line x1={leftX + 12} y1={legendY + 180} x2={leftX + 40} y2={legendY + 180} stroke={MUTED} strokeWidth={1.6} strokeDasharray="5 4" />
                <text x={leftX + 52} y={legendY + 184} fontSize={11.5} fill={INK}>表演活动范围(参考)</text>
              </g>
            );
          })()}

          {/* ===== 右栏 ===== */}
          {(() => {
            let y = 96;
            const nodes = [];
            nodes.push(<PanelSection key="d" x={rightX} y={y} w={colW} title="队形设计建议" lines={designLines} />);
            y += sectionHeight(designLines.length);
            // 服装颜色建议(色板)
            const swatchH = 132;
            nodes.push(
              <g key="c">
                <rect x={rightX} y={y} width={colW} height={swatchH} rx={8} fill={PANEL_BG} stroke={PANEL_BORDER} />
                <rect x={rightX} y={y} width={colW} height={24} rx={8} fill="#efe9dc" />
                <rect x={rightX} y={y + 16} width={colW} height={8} fill="#efe9dc" />
                <text x={rightX + 10} y={y + 16.5} fontSize={12.5} fontWeight={700} fill={INK}>服装颜色建议</text>
                <text x={rightX + 10} y={y + 44} fontSize={11} fill={INK}>男生建议</text>
                {[BOY_TIE, "#a9c1e2", "#c9ced6", "#f2f4f7"].map((c, i) => (
                  <rect key={i} x={rightX + 10 + i * 42} y={y + 52} width={34} height={24} rx={5} fill={c} stroke={PANEL_BORDER} />
                ))}
                <text x={rightX + 10} y={y + 96} fontSize={11} fill={INK}>女生建议</text>
                {[GIRL_DRESS, "#f6d2d8", GIRL_DRESS_B, "#faf3e3"].map((c, i) => (
                  <rect key={i} x={rightX + 10 + i * 42} y={y + 102} width={34} height={24} rx={5} fill={c} stroke={PANEL_BORDER} />
                ))}
              </g>
            );
            y += swatchH + 10;
            nodes.push(<PanelSection key="l" x={rightX} y={y} w={colW} title="舞台 / 灯光建议" lines={lightLines} />);
            y += sectionHeight(lightLines.length);
            nodes.push(<PanelSection key="p" x={rightX} y={y} w={colW} title="参考参数(建议值)" lines={paramLines} />);
            return nodes;
          })()}

          {/* ===== 底部签字栏 ===== */}
          <line x1={18} y1={VIEW_H - 66} x2={VIEW_W - 18} y2={VIEW_H - 66} stroke={PANEL_BORDER} strokeWidth={1.5} />
          <text x={30} y={VIEW_H - 34} fontSize={13} fill={INK}>生成时间:{dateStr}</text>
          <text x={330} y={VIEW_H - 34} fontSize={13} fill={INK}>生成者:StageOS{projectTitle ? ` · ${projectTitle}` : ""}</text>
          <text x={790} y={VIEW_H - 34} fontSize={13} fill={INK}>校对:＿＿＿＿＿＿</text>
          <text x={1020} y={VIEW_H - 34} fontSize={13} fill={INK}>审核:＿＿＿＿＿＿</text>
          <text x={VIEW_W - 30} y={VIEW_H - 34} textAnchor="end" fontSize={12} fill={MUTED}>本图为示意模板,具体以确认版为准。</text>
        </svg>
      </div>
    </div>
  );
}
