import { describe, expect, it } from "vitest";
import { validateStageInputDetailed, type StageInputData } from "@/lib/stageos";
import { buildFieldHints, findUnmatched } from "@/lib/validationHintKeywords";

// 覆盖 validateStageInputDetailed 所有分支的输入组合
const scenarios: Array<{ name: string; data: StageInputData }> = [
  {
    name: "performerCount 非正",
    data: { performerCount: 0, maleCount: 0, femaleCount: 0 },
  },
  {
    name: "male + female 与 total 不一致",
    data: { performerCount: 10, maleCount: 4, femaleCount: 5 },
  },
  {
    name: "只填 male 未填 female",
    data: { performerCount: 10, maleCount: 4 },
  },
  {
    name: "人均预算负数",
    data: { performerCount: 2, maleCount: 1, femaleCount: 1, perPersonBudget: -1 },
  },
  {
    name: "彩排频次非法",
    data: { performerCount: 2, maleCount: 1, femaleCount: 1, rehearsalFrequencyPerWeek: 4 as unknown as 2 },
  },
  {
    name: "学生 studentId 重复 / heightCm 非法",
    data: {
      performerCount: 2,
      maleCount: 1,
      femaleCount: 1,
      students: [
        { studentId: "S001", gender: "male", heightCm: 0 },
        { studentId: "S001", gender: "female", heightCm: 160 },
      ],
    },
  },
  {
    name: "学生行数与总人数不一致 / 性别分布不一致",
    data: {
      performerCount: 3,
      maleCount: 2,
      femaleCount: 1,
      students: [
        { studentId: "A", gender: "female", heightCm: 160 },
        { studentId: "B", gender: "female", heightCm: 165 },
        { studentId: "C", gender: "female", heightCm: 170 },
      ],
    },
  },
];

describe("validation hint keywords", () => {
  for (const s of scenarios) {
    it(`所有消息都被关键词命中:${s.name}`, () => {
      const messages = validateStageInputDetailed(s.data);
      const total = messages.errors.length + messages.warnings.length;
      expect(total).toBeGreaterThan(0);
      const unmatched = findUnmatched(messages);
      expect(
        unmatched.errors.concat(unmatched.warnings),
        `未匹配任何字段的消息:${JSON.stringify(unmatched)}`,
      ).toEqual([]);
    });
  }

  it("buildFieldHints 至少覆盖到一个字段", () => {
    const messages = validateStageInputDetailed({ performerCount: 10, maleCount: 4, femaleCount: 5 });
    const hints = buildFieldHints(messages);
    const totalPerField = Object.values(hints).reduce((n, h) => n + h.errors.length + h.warnings.length, 0);
    expect(totalPerField).toBeGreaterThan(0);
  });
});
