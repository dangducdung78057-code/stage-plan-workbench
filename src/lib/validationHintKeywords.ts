// 字段级联动提示的关键词配置。
// 用法:validateStageInputDetailed 返回的 errors/warnings 会被这里的关键词
// 分派到 ProjectEditor 中对应的输入字段下方。新增字段或调整措辞时,
// 只需在此扩充关键词即可,无需修改 UI 代码。
export const FIELD_HINT_KEYWORDS = {
  performerCount: ["performerCount", "总人数", "人数校验", "学生行数"],
  maleCount: ["maleCount", "男生", "人数校验", "性别分布"],
  femaleCount: ["femaleCount", "女生", "人数校验", "性别分布"],
  perPersonBudget: ["人均预算", "perPersonBudget"],
  rehearsal: ["彩排频次", "rehearsalFrequency"],
  students: ["studentId", "heightCm", "学生行数", "性别分布"],
} as const satisfies Record<string, readonly string[]>;

export type FieldHintKey = keyof typeof FIELD_HINT_KEYWORDS;

export type FieldHint = { errors: string[]; warnings: string[] };

export function pickFieldHint(
  messages: { errors: string[]; warnings: string[] },
  keywords: readonly string[],
): FieldHint {
  const match = (m: string) => keywords.some((k) => m.includes(k));
  return {
    errors: messages.errors.filter(match),
    warnings: messages.warnings.filter(match),
  };
}

export function buildFieldHints(messages: { errors: string[]; warnings: string[] }): Record<FieldHintKey, FieldHint> {
  const out = {} as Record<FieldHintKey, FieldHint>;
  (Object.keys(FIELD_HINT_KEYWORDS) as FieldHintKey[]).forEach((k) => {
    out[k] = pickFieldHint(messages, FIELD_HINT_KEYWORDS[k]);
  });
  return out;
}

export function findUnmatched(messages: { errors: string[]; warnings: string[] }): FieldHint {
  const all = Object.values(FIELD_HINT_KEYWORDS).flat() as string[];
  const notMatched = (m: string) => !all.some((k) => m.includes(k));
  return {
    errors: messages.errors.filter(notMatched),
    warnings: messages.warnings.filter(notMatched),
  };
}
