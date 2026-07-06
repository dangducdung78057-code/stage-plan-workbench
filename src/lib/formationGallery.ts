// 队形插画模板图库：21 个节目类型 → 8 个队形族横幅模板。
// 模板为内置静态资源（试用期可用，零运行时成本）；
// 付费版可在此基础上接入图像模型实时生成专属图。

export type FormationFamily = {
  key: string;
  title: string;
  image: string;
  caption: string;
  phases: string[];
};

export const FORMATION_FAMILIES: Record<string, FormationFamily> = {
  chorus: {
    key: "chorus",
    title: "合唱队形模板",
    image: "/formations/family-chorus.png",
    caption: "按学段递进:两排横列 → 弧形三排声部分层 → 大弧四排双色声部",
    phases: ["两排横列·整齐可爱", "弧形三排·声部分层", "大弧四排·双色声部"],
  },
  recitation: {
    key: "recitation",
    title: "朗诵队形模板",
    image: "/formations/family-recitation.png",
    caption: "弧形讲故事 → 一字排开宣示 / V 字凝聚 → 散点到 V 字阶梯多线叙事",
    phases: ["弧形·讲故事", "一字排开·宣示", "散点→V字阶梯·多线叙事"],
  },
  dance: {
    key: "dance",
    title: "舞蹈队形模板",
    image: "/formations/family-dance.png",
    caption: "圆形童趣互动 → 斜线交错流动画面 → 双三角中心独舞",
    phases: ["圆形·童趣互动", "斜线交错·流动画面", "双三角·中心独舞"],
  },
  cheerleading: {
    key: "cheerleading",
    title: "啦啦操队形模板",
    image: "/formations/family-cheerleading.png",
    caption: "三层定格花球展示 → 金字塔初现 → 复合金字塔难度嵌入",
    phases: ["三层定格·花球展示", "金字塔初现·口号嵌入", "复合金字塔·难度嵌入"],
  },
  orchestra: {
    key: "orchestra",
    title: "器乐队形模板",
    image: "/formations/family-orchestra.png",
    caption: "单弧席位 → 双弧声部分区 → 三弧全编制指挥中心",
    phases: ["单弧席位·轻打击乐", "双弧席位·声部分区", "三弧全编制·指挥中心"],
  },
  ceremony: {
    key: "ceremony",
    title: "仪式礼仪队形模板",
    image: "/formations/family-ceremony.png",
    caption: "一字迎宾 → 双列引导颁奖动线 → 扇形主席台礼仪定点",
    phases: ["一字迎宾·彩花列队", "双列引导·颁奖动线", "扇形主席台·礼仪定点"],
  },
  martial: {
    key: "martial",
    title: "武术杂技队形模板",
    image: "/formations/family-martial.png",
    caption: "方阵齐打 → 梯次错位器械展示 → 圆阵包围中心翻腾",
    phases: ["方阵齐打·基本拳", "梯次错位·器械展示", "圆阵包围·中心翻腾"],
  },
  gala: {
    key: "gala",
    title: "晚会展演队形模板",
    image: "/formations/family-gala.png",
    caption: "圆形包容开场 → 双三角对称张力 → 弧形分层温暖收束",
    phases: ["圆形·包容开场", "双三角·对称张力", "弧形分层·温暖收束"],
  },
  drama: {
    key: "drama",
    title: "戏剧走位模板",
    image: "/formations/family-drama.png",
    caption: "定格亮相旁白开场 → 对角对峙冲突调度 → 一字谢幕全员鞠躬",
    phases: ["定格亮相·旁白开场", "对角对峙·冲突调度", "一字谢幕·全员鞠躬"],
  },
};

// 21 个节目类型 → 队形族
const TYPE_TO_FAMILY: Record<string, string> = {
  chorus: "chorus",
  mixed_chorus: "chorus",
  recitation: "recitation",
  drama: "drama",
  classical_dance: "dance",
  folk_dance: "dance",
  modern_jazz_street: "dance",
  ballet: "dance",
  western_orchestra: "orchestra",
  folk_orchestra: "orchestra",
  instrument: "orchestra",
  host: "ceremony",
  etiquette_award: "ceremony",
  acrobatics_martial_arts: "martial",
  cheerleading: "cheerleading",
  sports_opening_ceremony: "gala",
  class_showcase: "gala",
  new_year_gala: "gala",
  holiday_festival: "gala",
  reunion_gala: "gala",
  non_competition_group_show: "gala",
};

export function familyForProgramType(programType?: string): FormationFamily {
  const key = (programType && TYPE_TO_FAMILY[programType]) || "gala";
  return FORMATION_FAMILIES[key];
}

export function allFamilies(): FormationFamily[] {
  return Object.values(FORMATION_FAMILIES);
}
