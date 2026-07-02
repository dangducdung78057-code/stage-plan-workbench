import type {
  StageInputData,
  CostumePlanPayload,
  Risk,
  ScheduleItem,
  PlatformSearchItem,
  PlanItem,
} from "./stageos";
import { PROGRAM_TYPES } from "./stageos";

function item(category: string, description: string, qty: number, unit: number, sizing?: string): PlanItem {
  return { category, description, qty, unitEstimate: unit, subtotal: qty * unit, sizing };
}

export function generateMockPlan(input: StageInputData): {
  costumePlan: CostumePlanPayload;
  risks: Risk[];
  reverseSchedule: ScheduleItem[];
  platformSearch: PlatformSearchItem[];
} {
  const female = input.femaleCount ?? Math.floor((input.performerCount ?? 0) / 2);
  const male = input.maleCount ?? (input.performerCount ?? 0) - female;
  const budget = input.perPersonBudget ?? 180;
  const programLabel =
    PROGRAM_TYPES.find((p) => p.value === input.programType)?.label ?? input.programType ?? "演出";
  const theme = input.programTheme || "主视觉";
  const color = input.screenThemeColor || "主色";

  const femalePlan: PlanItem[] = [
    item("上装", `${theme} 主色演出上衣(女)`, female, Math.round(budget * 0.45), "按身高分档 S/M/L"),
    item("下装", `${programLabel} 演出裙/裤(女)`, female, Math.round(budget * 0.35), "按腰围分档"),
    item("鞋", "统一低跟软底演出鞋", female, Math.round(budget * 0.15), "按脚长分档"),
  ];
  const malePlan: PlanItem[] = [
    item("上装", `${theme} 主色演出上衣(男)`, male, Math.round(budget * 0.45), "按胸围/身高分档"),
    item("下装", `${programLabel} 演出裤(男)`, male, Math.round(budget * 0.35), "按腰围分档"),
    item("鞋", "统一黑色低帮演出鞋", male, Math.round(budget * 0.15), "按脚长分档"),
  ];
  const total = female + male;
  const accessories: PlanItem[] = [
    item("配饰", `${color} 系头饰/发带`, total, 12),
    item("配饰", "统一腰带/领结", total, 10),
    item("备件", "备用扣件/别针套装", Math.ceil(total * 0.1), 8),
  ];

  const totalEstimate =
    [...femalePlan, ...malePlan, ...accessories].reduce((s, i) => s + i.subtotal, 0);

  const costumePlan: CostumePlanPayload = {
    femalePlan,
    malePlan,
    accessories,
    totalEstimate,
    sizingReminders: [
      "身高分档按 ±5cm 归档,极端身高需单独定制。",
      "女生下装建议提供两档腰围可调节设计。",
      "鞋码统一提供试穿窗口,避免临场不合脚。",
    ],
    purchaseStrategy: [
      "主料统一供应商下单,配饰分渠道备货以降低断货风险。",
      "先小批量验样(≥3 件/型号)再全量下单。",
      "预留 5% 备件预算用于临场破损替换。",
    ],
    planB: [
      "若主色断货,启用近似色替代方案并调整灯光偏色补偿。",
      "若尺码不足,启用外部租赁供应商 48h 应急通道。",
    ],
  };

  const risks: Risk[] = [
    { level: "medium", title: "尺码风险", detail: "学生人体数据以匿名身高为准,试穿窗口应≥3 天。" },
    { level: "medium", title: "供货时效", detail: "主料建议下单至演出日预留≥21 天缓冲。" },
    { level: "low", title: "配色偏差", detail: "屏幕主色与实物色差建议进行灯下比色。" },
    ...(input.rehearsalFrequencyPerWeek && input.rehearsalFrequencyPerWeek < 3
      ? [{ level: "high" as const, title: "彩排频次不足", detail: "每周<3 次彩排,建议提前一周开始适配。" }]
      : []),
  ];

  const perfDate = input.performanceDate ? new Date(input.performanceDate) : null;
  const reverseSchedule: ScheduleItem[] = [
    { daysBefore: 30, task: "确认服装总表与预算(本表)", owner: "排产负责人" },
    { daysBefore: 25, task: "供应商比价与样衣下单", owner: "采购" },
    { daysBefore: 18, task: "样衣验收 + 尺码摸底", owner: "排产 + 班主任" },
    { daysBefore: 14, task: "主料全量下单", owner: "采购" },
    { daysBefore: 7, task: "到货验收 + 试穿窗口", owner: "排产" },
    { daysBefore: 3, task: "彩排合装 + 备件到位", owner: "现场" },
    { daysBefore: 1, task: "终检 + 应急包封装", owner: "现场" },
  ];
  if (perfDate) {
    reverseSchedule.forEach((s) => {
      const d = new Date(perfDate);
      d.setDate(d.getDate() - s.daysBefore);
      (s as any).date = d.toISOString().slice(0, 10);
    });
  }

  const kw = `${input.schoolStage ?? ""} ${programLabel} ${theme} 演出服 ${color}`.trim();
  const platformSearch: PlatformSearchItem[] = [
    {
      platform: "淘宝",
      query: kw,
      url: `https://s.taobao.com/search?q=${encodeURIComponent(kw)}`,
      note: "仅为搜索关键词建议,不代表 SKU/库存/价格,需人工核验。",
    },
    {
      platform: "1688",
      query: kw + " 团购",
      url: `https://s.1688.com/selloffer/offer_search.htm?keywords=${encodeURIComponent(kw + " 团购")}`,
      note: "批量渠道建议,实际下单前必须打样验证。",
    },
    {
      platform: "京东",
      query: kw,
      url: `https://search.jd.com/Search?keyword=${encodeURIComponent(kw)}`,
      note: "供参考,不代表任何采购承诺。",
    },
  ];

  return { costumePlan, risks, reverseSchedule, platformSearch };
}
