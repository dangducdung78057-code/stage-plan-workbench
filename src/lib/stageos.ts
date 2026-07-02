// StageOS domain constants and helpers
export const STAGEOS_VERSION = "stageos-v2.2-export-suite-pass" as const;

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

export function validateStageInput(data: StageInputData) {
  const issues: string[] = [];
  const { performerCount, maleCount, femaleCount, students } = data;
  if (typeof performerCount === "number") {
    if (typeof maleCount === "number" && typeof femaleCount === "number") {
      if (maleCount + femaleCount !== performerCount) {
        issues.push(
          `人数校验:男(${maleCount}) + 女(${femaleCount}) = ${maleCount + femaleCount},与总人数 ${performerCount} 不一致。`,
        );
      }
    }
    if (students && students.length > 0 && students.length !== performerCount) {
      issues.push(`学生行数(${students.length})与总人数(${performerCount})不一致。`);
    }
  }
  return issues;
}
