// StageOS domain constants and helpers
export const STAGEOS_VERSION = "stageos-v4.1-webhook-signature" as const;

export const SCHOOL_STAGES = [
  { value: "primary", label: "小学" },
  { value: "junior", label: "初中" },
  { value: "senior", label: "高中" },
] as const;

export const PROGRAM_TYPES = [
  { value: "chorus", label: "合唱" },
  { value: "mixed_chorus", label: "混声合唱" },
  { value: "recitation", label: "朗诵" },
  { value: "drama", label: "戏剧/话剧" },
  { value: "classical_dance", label: "古典舞" },
  { value: "folk_dance", label: "民族舞" },
  { value: "modern_jazz_street", label: "现代/爵士/街舞" },
  { value: "ballet", label: "芭蕾" },
  { value: "western_orchestra", label: "西洋管弦乐" },
  { value: "folk_orchestra", label: "民族管弦乐" },
  { value: "instrument", label: "器乐" },
  { value: "host", label: "主持" },
  { value: "etiquette_award", label: "礼仪/颁奖" },
  { value: "acrobatics_martial_arts", label: "杂技/武术" },
  { value: "cheerleading", label: "啦啦操" },
  { value: "sports_opening_ceremony", label: "运动会开幕式" },
  { value: "class_showcase", label: "班级展演" },
  { value: "new_year_gala", label: "新年晚会" },
  { value: "holiday_festival", label: "节庆/校园节" },
  { value: "reunion_gala", label: "校友/返校晚会" },
  { value: "non_competition_group_show", label: "非比赛集体展演" },
] as const;

export const REHEARSAL_FREQUENCIES = [2, 3, 5] as const;

export const PROJECT_STATUSES = [
  { value: "draft", label: "草稿", tone: "muted" },
  { value: "planning", label: "排产中", tone: "info" },
  { value: "needs_revision", label: "待修订", tone: "warning" },
  { value: "confirmed", label: "已确认", tone: "success" },
  { value: "exported", label: "已导出", tone: "primary" },
] as const;

export type ProjectStatus = typeof PROJECT_STATUSES[number]["value"];

export const CONFIRMATION_STATUSES = [
  { value: "draft", label: "草稿" },
  { value: "needs_revision", label: "待修订" },
  { value: "confirmed", label: "已确认" },
] as const;

export const STAGEOS_MODULES = [
  {
    group: "StageOS RAG 核心",
    routes: [
      "/api/stageos/rag/retrieve",
      "/api/stageos/rag/compile-prompt",
      "/api/stageos/rag/self-review",
      "/api/stageos/rag/gated-output",
      "/api/stageos/rag/knowledge-map",
    ],
    desc: "检索、提示词编排、自审与门控输出。",
  },
  {
    group: "服装总表 Costume Master Plan",
    routes: [
      "/api/stageos/costume-master-plan",
      "/api/stageos/costume-master-plan/search-tags",
      "/api/stageos/costume-master-plan/self-check",
      "/api/stageos/costume-master-plan/render-context",
      "/api/stageos/costume-master-plan/reverse-schedule",
      "/api/stageos/costume-master-plan/platform-search",
      "/api/stageos/costume-master-plan/confirm",
      "/api/stageos/costume-master-plan/export",
    ],
    desc: "服装总表生成、检索标签、自检、渲染上下文、倒排、平台搜索、确认与导出。",
  },
  {
    group: "配色 RAG",
    routes: ["/api/stageos/color-rag"],
    desc: "面向舞台色彩与灯光风格的知识检索。",
  },
  {
    group: "蓝图与 2D 预览",
    routes: ["/api/stageos/blueprint-plan", "/api/stageos/indoor-2d-preview"],
    desc: "队形/舞美蓝图与室内 2D 预览。",
  },
  {
    group: "3D 人台",
    routes: ["/api/stageos/3d-mannequin"],
    desc: "3D 人台造型预览。",
  },
  {
    group: "渲染预览",
    routes: ["/api/stageos/render-preview"],
    desc: "综合渲染预览。",
  },
  {
    group: "图片 / 视频",
    routes: ["/api/stageos/render-photo-v2", "/api/stageos/render-video-15s"],
    desc: "静态与短视频渲染(未来集成)。",
  },
  {
    group: "服装商务",
    routes: [
      "/api/stageos/costume-commerce/suggest",
      "/api/stageos/costume-commerce/photo",
      "/api/stageos/costume-commerce/search",
    ],
    desc: "商务建议、参考图与搜索(仅建议,需人工核验)。",
  },
] as const;

export type StageInputData = {
  schoolStage?: string;
  programType?: string;
  programTheme?: string;
  venueType?: string;
  performerCount?: number;
  maleCount?: number;
  femaleCount?: number;
  perPersonBudget?: number;
  screenThemeColor?: string;
  lightingStyle?: string;
  specialExpectation?: string;
  performanceDate?: string;
  rehearsalFrequencyPerWeek?: 2 | 3 | 5;
  students?: Array<{
    studentId: string;
    gender: "male" | "female";
    heightCm: number;
    roleLabel?: string;
  }>;
  confirmedFormation?: {
    summary?: string;
    rows?: number;
    layoutName?: string;
    spacingRule?: string;
  };
};

export type CostumePlanPayload = {
  femalePlan: PlanItem[];
  malePlan: PlanItem[];
  accessories: PlanItem[];
  totalEstimate: number;
  sizingReminders: string[];
  purchaseStrategy: string[];
  planB: string[];
};

export type PlanItem = {
  category: string;
  description: string;
  qty: number;
  unitEstimate: number;
  subtotal: number;
  sizing?: string;
};

export type Risk = { level: "low" | "medium" | "high"; title: string; detail: string };
export type ScheduleItem = { daysBefore: number; task: string; owner: string };
export type PlatformSearchItem = { platform: string; query: string; url: string; note: string };

export function validateStageInputDetailed(data: StageInputData): { errors: string[]; warnings: string[] } {
  const errors: string[] = [];
  const warnings: string[] = [];
  const { performerCount, maleCount, femaleCount, perPersonBudget, students, rehearsalFrequencyPerWeek } = data;

  const isNonNegInt = (n: unknown): n is number =>
    typeof n === "number" && Number.isFinite(n) && Number.isInteger(n) && n >= 0;

  if (performerCount !== undefined) {
    if (!isNonNegInt(performerCount) || performerCount <= 0) {
      errors.push(`总人数 performerCount 必须为正整数,当前:${performerCount}`);
    }
  }
  if (maleCount !== undefined && !isNonNegInt(maleCount)) {
    errors.push(`男生数 maleCount 必须为非负整数,当前:${maleCount}`);
  }
  if (femaleCount !== undefined && !isNonNegInt(femaleCount)) {
    errors.push(`女生数 femaleCount 必须为非负整数,当前:${femaleCount}`);
  }
  if (typeof perPersonBudget === "number" && (!Number.isFinite(perPersonBudget) || perPersonBudget < 0)) {
    errors.push(`人均预算必须为非负数,当前:${perPersonBudget}`);
  }
  if (rehearsalFrequencyPerWeek !== undefined && ![2, 3, 5].includes(rehearsalFrequencyPerWeek as number)) {
    errors.push(`彩排频次必须为 2 / 3 / 5,当前:${rehearsalFrequencyPerWeek}`);
  }

  if (typeof performerCount === "number" && typeof maleCount === "number" && typeof femaleCount === "number") {
    if (maleCount + femaleCount !== performerCount) {
      errors.push(
        `人数校验:男(${maleCount}) + 女(${femaleCount}) = ${maleCount + femaleCount},与总人数 ${performerCount} 不一致。`,
      );
    }
  } else if (typeof performerCount === "number" && (typeof maleCount === "number") !== (typeof femaleCount === "number")) {
    warnings.push("男生数与女生数需成对填写,否则无法校验总人数一致性。");
  }

  if (typeof performerCount === "number" && students && students.length > 0 && students.length !== performerCount) {
    warnings.push(`学生行数(${students.length})与总人数(${performerCount})不一致。`);
  }

  if (students && students.length > 0) {
    const ids = new Set<string>();
    students.forEach((s, i) => {
      if (!s.studentId?.trim()) errors.push(`第 ${i + 1} 行 studentId 必填。`);
      else if (ids.has(s.studentId)) errors.push(`studentId 重复:${s.studentId}`);
      else ids.add(s.studentId);
      if (!Number.isFinite(s.heightCm) || s.heightCm <= 0) {
        errors.push(`第 ${i + 1} 行 heightCm 需为正数。`);
      }
    });
    if (typeof maleCount === "number" && typeof femaleCount === "number") {
      const m = students.filter((s) => s.gender === "male").length;
      const f = students.filter((s) => s.gender === "female").length;
      if (students.length === (performerCount ?? students.length) && (m !== maleCount || f !== femaleCount)) {
        warnings.push(`学生性别分布(男${m}/女${f})与 maleCount/femaleCount(${maleCount}/${femaleCount})不一致。`);
      }
    }
  }

  return { errors, warnings };
}

export function validateStageInput(data: StageInputData): string[] {
  const { errors, warnings } = validateStageInputDetailed(data);
  return [...errors, ...warnings];
}
