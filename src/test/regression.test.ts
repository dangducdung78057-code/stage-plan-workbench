/**
 * 回归测试钩子 (Regression hook)
 *
 * 目的:在 CI / 发布前 一键校验关键不变量,防止字段校验、
 * 联动提示关键词、校验历史等能力发生静默回归。
 *
 * 运行方式:
 *   bun run test:regression
 *
 * 新增回归项时,请在下方追加 `it(...)` 断言,并在 PR 描述中说明
 * 该项对应的能力层 (L0 / L1 / L2)。
 */
import { describe, expect, it } from "vitest";
import {
  validateStageInputDetailed,
  appendValidationHistory,
  type StageInputData,
} from "@/lib/stageos";
import {
  FIELD_HINT_KEYWORDS,
  buildFieldHints,
  findUnmatched,
} from "@/lib/validationHintKeywords";

describe("regression: validation core", () => {
  it("male + female 必须等于 performerCount", () => {
    const { errors } = validateStageInputDetailed({
      performerCount: 10,
      maleCount: 4,
      femaleCount: 5,
    });
    expect(errors.some((m) => m.includes("人数校验"))).toBe(true);
  });

  it("彩排频次仅接受 2 / 3 / 5", () => {
    const { errors } = validateStageInputDetailed({
      rehearsalFrequencyPerWeek: 4 as unknown as 2,
    });
    expect(errors.some((m) => m.includes("彩排频次"))).toBe(true);
  });

  it("studentId 重复必须报错", () => {
    const { errors } = validateStageInputDetailed({
      students: [
        { studentId: "S001", gender: "male", heightCm: 160 },
        { studentId: "S001", gender: "female", heightCm: 160 },
      ],
    });
    expect(errors.some((m) => m.includes("studentId 重复"))).toBe(true);
  });

  it("合法输入无 errors / warnings", () => {
    const ok: StageInputData = {
      performerCount: 2,
      maleCount: 1,
      femaleCount: 1,
      perPersonBudget: 300,
      rehearsalFrequencyPerWeek: 3,
      students: [
        { studentId: "S001", gender: "male", heightCm: 170 },
        { studentId: "S002", gender: "female", heightCm: 160 },
      ],
    };
    expect(validateStageInputDetailed(ok)).toEqual({ errors: [], warnings: [] });
  });
});

describe("regression: field hint keyword coverage", () => {
  const scenarios: StageInputData[] = [
    { performerCount: 0 },
    { performerCount: 10, maleCount: 4, femaleCount: 5 },
    { performerCount: 2, maleCount: 1, femaleCount: 1, perPersonBudget: -1 },
    { rehearsalFrequencyPerWeek: 4 as unknown as 2 },
    {
      performerCount: 2,
      maleCount: 1,
      femaleCount: 1,
      students: [
        { studentId: "", gender: "male", heightCm: 0 },
        { studentId: "X", gender: "female", heightCm: -1 },
      ],
    },
  ];

  for (const [i, data] of scenarios.entries()) {
    it(`场景 #${i + 1} 所有消息均能被字段关键词命中`, () => {
      const messages = validateStageInputDetailed(data);
      const unmatched = findUnmatched(messages);
      expect(unmatched).toEqual({ errors: [], warnings: [] });
    });
  }

  it("FIELD_HINT_KEYWORDS 每个字段至少含一个关键词", () => {
    for (const [field, kws] of Object.entries(FIELD_HINT_KEYWORDS)) {
      expect(kws.length, `${field} 关键词为空`).toBeGreaterThan(0);
    }
  });

  it("buildFieldHints 分派后的总条数 ≥ 原始条数(允许一条消息命中多个字段)", () => {
    const messages = validateStageInputDetailed({
      performerCount: 10,
      maleCount: 4,
      femaleCount: 5,
    });
    const hints = buildFieldHints(messages);
    const totalPerField = Object.values(hints).reduce(
      (n, h) => n + h.errors.length + h.warnings.length,
      0,
    );
    expect(totalPerField).toBeGreaterThanOrEqual(
      messages.errors.length + messages.warnings.length,
    );
  });
});

describe("regression: validation history persistence", () => {
  it("appendValidationHistory 保留最近 20 条并去重相邻相同", () => {
    let acc: StageInputData = {};
    for (let i = 0; i < 25; i++) {
      acc = appendValidationHistory(acc as never, {
        checkedAt: new Date(2026, 0, 1, 0, i).toISOString(),
        errors: [i % 2 === 0 ? "e" : "e2"],
        warnings: [],
      });
    }
    const history = (acc as unknown as { __validationHistory: unknown[] }).__validationHistory;
    expect(history.length).toBeLessThanOrEqual(20);
    expect(history.length).toBeGreaterThan(0);
  });

  it("相邻相同的 errors/warnings 只更新 checkedAt", () => {
    const snap = { checkedAt: "2026-01-01T00:00:00Z", errors: ["e"], warnings: [] };
    let acc = appendValidationHistory({}, snap);
    acc = appendValidationHistory(acc, { ...snap, checkedAt: "2026-01-01T00:01:00Z" });
    const history = (acc as unknown as { __validationHistory: { checkedAt: string }[] }).__validationHistory;
    expect(history.length).toBe(1);
    expect(history[0].checkedAt).toBe("2026-01-01T00:01:00Z");
  });
});
