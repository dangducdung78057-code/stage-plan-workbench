import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

/**
 * 校验 auth 邮件模板的变量完整性与占位符一致性。
 * - 每个模板必须声明的 Props 变量集合（interface）
 * - 每个变量都必须在 JSX 中被引用（{var} 或 ${var}）
 * - 与 auth-email-hook 中 SAMPLE_DATA / templateProps 的字段保持一致
 */

const ROOT = resolve(__dirname, "../../supabase/functions/_shared/email-templates");

type Spec = { file: string; required: string[] };

const SPECS: Record<string, Spec> = {
  signup: {
    file: "signup.tsx",
    required: ["siteName", "siteUrl", "recipient", "confirmationUrl"],
  },
  recovery: {
    file: "recovery.tsx",
    required: ["siteName", "confirmationUrl"],
  },
  magiclink: {
    file: "magic-link.tsx",
    required: ["siteName", "confirmationUrl"],
  },
};

function read(file: string): string {
  return readFileSync(resolve(ROOT, file), "utf8");
}

describe("auth email templates: variable integrity", () => {
  for (const [name, spec] of Object.entries(SPECS)) {
    describe(name, () => {
      const src = read(spec.file);

      it("声明了完整的 Props interface 字段", () => {
        const m = src.match(/interface\s+\w+Props\s*\{([\s\S]*?)\}/);
        expect(m, `${spec.file} 缺少 Props interface`).toBeTruthy();
        const body = m![1];
        for (const key of spec.required) {
          expect(body).toMatch(new RegExp(`\\b${key}\\b\\s*:`));
        }
      });

      it("每个变量在 JSX 中被引用（占位符一致）", () => {
        for (const key of spec.required) {
          const used =
            new RegExp(`\\{\\s*${key}\\s*\\}`).test(src) ||
            new RegExp(`\\$\\{${key}\\}`).test(src) ||
            new RegExp(`href=\\{${key}\\}`).test(src);
          expect(used, `${spec.file} 未引用变量 ${key}`).toBe(true);
        }
      });

      it("未引入未声明的模板变量", () => {
        const declared = new Set(spec.required);
        // 收集 {xxx} 内的裸标识符（排除 JSX 表达式常见片段）
        const refs = new Set<string>();
        for (const m of src.matchAll(/\{\s*([a-zA-Z_][a-zA-Z0-9_]*)\s*\}/g)) {
          refs.add(m[1]);
        }
        // 允许出现在模板中的非变量标识符（组件/样式/内建）
        const allowlist = new Set([
          "main", "container", "h1", "text", "button", "footer", "link",
          "codeStyle",
        ]);
        for (const r of refs) {
          if (allowlist.has(r)) continue;
          expect(declared.has(r), `${spec.file} 使用了未声明变量 ${r}`).toBe(true);
        }
      });
    });
  }

  it("与 auth-email-hook 的 SAMPLE_DATA 字段保持一致", () => {
    const hook = readFileSync(
      resolve(__dirname, "../../supabase/functions/auth-email-hook/index.ts"),
      "utf8",
    );
    for (const [name, spec] of Object.entries(SPECS)) {
      const re = new RegExp(`${name}:\\s*\\{([\\s\\S]*?)\\}`);
      const m = hook.match(re);
      expect(m, `auth-email-hook SAMPLE_DATA 缺少 ${name}`).toBeTruthy();
      const body = m![1];
      for (const key of spec.required) {
        expect(body, `SAMPLE_DATA.${name} 缺少 ${key}`).toMatch(
          new RegExp(`\\b${key}\\b\\s*:`),
        );
      }
    }
  });
});
