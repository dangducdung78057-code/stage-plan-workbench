// StageOS 队形与舞台走位生成引擎。
// 基于 StageInput(人数/性别/身高/节目类型/场地)确定性生成 2-3 个队形方案:
// 合唱类以整体方阵为主(知识库:2-3 个队形,强调整体统一与色块层次),
// 身高排序遵循"后排高前排矮",高中及以上支持声部双色分组可视化。
import type { StageInputData } from "@/lib/stageos";

export type FormationSlot = {
  /** 舞台坐标,x: 0-100(左→右), y: 0-100(舞台后沿→台口) */
  x: number;
  y: number;
  row: number; // 1 = 最后排(离观众最远)
  col: number;
  studentId?: string;
  gender: "male" | "female";
  heightCm?: number;
  /** 声部/色块分组: A | B | conductor */
  group: "A" | "B" | "conductor";
};

export type MovementCue = { phase: string; cue: string };

export type FormationScheme = {
  key: string;
  name: string;
  suitedFor: string;
  rows: number;
  spacingRule: string;
  slots: FormationSlot[];
  movementCues: MovementCue[];
  notes: string[];
};

type RosterEntry = {
  studentId?: string;
  gender: "male" | "female";
  heightCm?: number;
};

/** 从 StageInput 构造名单:优先用学生明细(按身高降序),否则按男女人数生成占位。 */
function buildRoster(data: StageInputData): RosterEntry[] {
  const students = data.students ?? [];
  if (students.length > 0) {
    return [...students]
      .sort((a, b) => (b.heightCm ?? 0) - (a.heightCm ?? 0))
      .map((s) => ({ studentId: s.studentId, gender: s.gender, heightCm: s.heightCm }));
  }
  const male = data.maleCount ?? Math.floor((data.performerCount ?? 0) / 2);
  const female = (data.performerCount ?? 0) - male;
  const roster: RosterEntry[] = [];
  for (let i = 0; i < male; i++) roster.push({ gender: "male" });
  for (let i = 0; i < female; i++) roster.push({ gender: "female" });
  return roster;
}

/** 行分布:后排略多(视觉金字塔),返回每排人数(row 1 = 最后排)。 */
function rowDistribution(total: number, rows: number): number[] {
  const base = Math.floor(total / rows);
  let remainder = total % rows;
  const counts: number[] = [];
  for (let r = 0; r < rows; r++) {
    // 余数优先分配给后排
    counts.push(base + (remainder > 0 ? 1 : 0));
    if (remainder > 0) remainder--;
  }
  return counts;
}

function pickRowCount(total: number): number {
  if (total <= 12) return 2;
  if (total <= 30) return 3;
  return 4;
}

/** y 坐标:row 1(最后排)靠舞台后沿。 */
function rowY(row: number, rows: number): number {
  const top = 18; // 后沿留白
  const bottom = 78; // 台口留白(前方留出指挥位)
  if (rows === 1) return (top + bottom) / 2;
  return top + ((row - 1) / (rows - 1)) * (bottom - top);
}

/** 将一排人均匀铺在 x 轴上(居中)。 */
function layoutRowX(count: number, xStart = 10, xEnd = 90): number[] {
  if (count === 1) return [(xStart + xEnd) / 2];
  const usable = xEnd - xStart;
  // 人少时收窄,避免过度分散
  const width = Math.min(usable, Math.max(28, count * 7));
  const start = (100 - width) / 2;
  return Array.from({ length: count }, (_, i) => start + (i / (count - 1)) * width);
}

/** 方阵:身高降序 → 后排到前排逐排填充,每排内高个在中间(山形)。 */
function buildBlockFormation(roster: RosterEntry[], rows: number): FormationSlot[] {
  const counts = rowDistribution(roster.length, rows);
  const slots: FormationSlot[] = [];
  let cursor = 0;
  for (let r = 0; r < rows; r++) {
    const rowRoster = roster.slice(cursor, cursor + counts[r]);
    cursor += counts[r];
    // 山形排列:最高在中间,依次向两侧交替
    const arranged: RosterEntry[] = [];
    rowRoster.forEach((entry, i) => {
      if (i % 2 === 0) arranged.push(entry);
      else arranged.unshift(entry);
    });
    const xs = layoutRowX(arranged.length);
    arranged.forEach((entry, i) => {
      slots.push({
        x: xs[i], y: rowY(r + 1, rows), row: r + 1, col: i + 1,
        studentId: entry.studentId, gender: entry.gender, heightCm: entry.heightCm,
        group: "A",
      });
    });
  }
  return slots;
}

/** 弧形梯队:每排沿浅弧线布置,弧心朝观众。 */
function buildArcFormation(roster: RosterEntry[], rows: number): FormationSlot[] {
  const base = buildBlockFormation(roster, rows);
  return base.map((s) => {
    // 距中线越远,越向舞台后方弯(浅弧)
    const dx = Math.abs(s.x - 50) / 50; // 0-1
    const lift = dx * dx * 10; // 最边缘上抬 10
    return { ...s, y: Math.max(12, s.y - lift) };
  });
}

/** 声部双色分组:左右两个声部色块(高中及以上合唱建议),按性别/名单对半分。 */
function buildVoiceGroupFormation(roster: RosterEntry[], rows: number): FormationSlot[] {
  const half = Math.ceil(roster.length / 2);
  const groupA = roster.slice(0, half);
  const groupB = roster.slice(half);
  const slots: FormationSlot[] = [];
  const build = (list: RosterEntry[], group: "A" | "B", xStart: number, xEnd: number) => {
    const counts = rowDistribution(list.length, rows);
    let cursor = 0;
    for (let r = 0; r < rows; r++) {
      const rowRoster = list.slice(cursor, cursor + counts[r]);
      cursor += counts[r];
      const xs = layoutRowX(rowRoster.length, xStart, xEnd).map((x) => {
        // 限制在各自半区
        const mid = (xStart + xEnd) / 2;
        const width = Math.min(xEnd - xStart - 4, Math.max(16, rowRoster.length * 6));
        const start = mid - width / 2;
        return rowRoster.length === 1 ? mid : start;
      });
      const width = Math.min(xEnd - xStart - 4, Math.max(16, rowRoster.length * 6));
      const mid = (xStart + xEnd) / 2;
      rowRoster.forEach((entry, i) => {
        const x = rowRoster.length === 1
          ? mid
          : mid - width / 2 + (i / (rowRoster.length - 1)) * width;
        slots.push({
          x, y: rowY(r + 1, rows), row: r + 1, col: i + 1,
          studentId: entry.studentId, gender: entry.gender, heightCm: entry.heightCm,
          group,
        });
      });
    }
  };
  build(groupA, "A", 6, 48);
  build(groupB, "B", 52, 94);
  return slots;
}

const CONDUCTOR_SLOT: FormationSlot = {
  x: 50, y: 92, row: 0, col: 0, gender: "female", group: "conductor",
};

function isChoirLike(programType?: string): boolean {
  if (!programType) return true;
  // 兼容代码值(chorus/mixed_chorus/recitation)与中文标签
  return /chorus|recitation|合唱|朗诵|齐诵/.test(programType);
}

function isSeniorStage(schoolStage?: string): boolean {
  // 兼容代码值(junior/senior)与中文标签
  return /junior|senior|高中|初中/.test(schoolStage ?? "");
}

/** 生成 2-3 个队形方案(确定性,无随机)。 */
export function generateFormations(data: StageInputData): FormationScheme[] {
  const roster = buildRoster(data);
  const total = roster.length;
  if (total === 0) return [];
  const rows = pickRowCount(total);
  const choir = isChoirLike(data.programType);
  const spacing = total > 30 ? "肩距约 0.6m,排距约 0.8m(人多收紧)" : "肩距约 0.8m,排距约 1m";

  const schemes: FormationScheme[] = [];

  schemes.push({
    key: "block",
    name: "整体方阵",
    suitedFor: "开场/主体段落 — 整体统一,色块完整",
    rows,
    spacingRule: spacing,
    slots: [...buildBlockFormation(roster, rows), ...(choir ? [CONDUCTOR_SLOT] : [])],
    movementCues: [
      { phase: "入场", cue: "从舞台两侧分两路依次入场,后排先就位,前排随后补位" },
      { phase: "定位", cue: "以中线为基准对齐,每排内目视左右肩距一致后立定" },
      { phase: "退场", cue: "前排先撤,后排跟进,沿入场路线原路退场" },
    ],
    notes: [
      "身高降序:高个居后排、每排内高个居中(山形),避免遮挡。",
      choir ? "指挥独立站位于台口中央,服装独立成色形成视觉焦点。" : "领队/主角建议前排中央。",
    ],
  });

  schemes.push({
    key: "arc",
    name: "弧形梯队",
    suitedFor: "抒情/高潮段落 — 面向观众的包裹感与层次",
    rows,
    spacingRule: spacing,
    slots: [...buildArcFormation(roster, rows), ...(choir ? [CONDUCTOR_SLOT] : [])],
    movementCues: [
      { phase: "换队形", cue: "由方阵两翼各自向后收拢成浅弧,中央保持不动(约 8 拍完成)" },
      { phase: "定位", cue: "两翼末端与台口保持不小于 1m 安全距离" },
      { phase: "还原", cue: "两翼向前推平即可还原为方阵" },
    ],
    notes: [
      "弧线让边缘队员微微朝向舞台中心,注意侧身角度统一。",
      "灯光建议顶光+面光结合,突出弧形层次。",
    ],
  });

  if (isSeniorStage(data.schoolStage) && choir && total >= 12) {
    schemes.push({
      key: "voice",
      name: "声部双色分组",
      suitedFor: "多声部合唱 — 声部可视化(知识库:高中及以上建议)",
      rows,
      spacingRule: spacing,
      slots: [...buildVoiceGroupFormation(roster, rows), CONDUCTOR_SLOT],
      movementCues: [
        { phase: "换队形", cue: "方阵从中线纵向裂开,左右各自收拢成两个色块(约 12 拍完成)" },
        { phase: "声部呼应", cue: "对唱/轮唱段落两色块可交替前倾半步示意" },
        { phase: "合流", cue: "尾声两色块向中线合拢还原方阵,同步收束" },
      ],
      notes: [
        "左右色块对应两个声部,配合双色服装分组实现声部可视化。",
        "两色块间保持约 1.5m 通道,供指挥视线与队员进出。",
      ],
    });
  }

  return schemes;
}

/** 舞台走位摘要(用于 confirmedFormation 持久化)。 */
export function summarizeFormation(scheme: FormationScheme, data: StageInputData): {
  summary: string; rows: number; layoutName: string; spacingRule: string;
} {
  const total = (data.students?.length ?? data.performerCount ?? 0);
  return {
    summary: `${scheme.name} · ${total} 人 ${scheme.rows} 排 · ${scheme.suitedFor}`,
    rows: scheme.rows,
    layoutName: scheme.name,
    spacingRule: scheme.spacingRule,
  };
}
