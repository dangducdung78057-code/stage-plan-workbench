import { describe, it, expect } from "vitest";
import { readFileSync, mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve, join } from "node:path";
import { spawnSync } from "node:child_process";
import { verifySitemapRobots } from "../../scripts/verify-sitemap-robots";

const ROOT = resolve(__dirname, "../..");
const SCRIPT_PATH = resolve(ROOT, "scripts/verify-sitemap-robots.ts");

function minimalRobots(url = "https://example.com/sitemap.xml") {
  return `User-agent: *\nAllow: /\n\nSitemap: ${url}\n`;
}
function minimalSitemap(locs: string[] = ["https://example.com/"]) {
  return [
    `<?xml version="1.0" encoding="UTF-8"?>`,
    `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">`,
    ...locs.map((l) => `  <url><loc>${l}</loc></url>`),
    `</urlset>`,
  ].join("\n");
}

describe("verifySitemapRobots — success", () => {
  it("接受项目真实的 robots.txt 与 sitemap.xml", () => {
    const robotsText = readFileSync(resolve(ROOT, "public/robots.txt"), "utf8");
    const sitemapText = readFileSync(resolve(ROOT, "public/sitemap.xml"), "utf8");
    const r = verifySitemapRobots({ robotsText, sitemapText });
    expect(r.ok).toBe(true);
    expect(r.message).toBe("");
  });

  it("接受最小合法组合", () => {
    const r = verifySitemapRobots({
      robotsText: minimalRobots(),
      sitemapText: minimalSitemap(),
    });
    expect(r.ok).toBe(true);
  });

  it("仅在 Googlebot 上 Disallow: / 不触发全站屏蔽错误", () => {
    const robotsText = `User-agent: Googlebot\nDisallow: /\n\nUser-agent: *\nAllow: /\n\nSitemap: https://example.com/sitemap.xml\n`;
    const r = verifySitemapRobots({ robotsText, sitemapText: minimalSitemap() });
    expect(r.ok).toBe(true);
  });
});

describe("verifySitemapRobots — robots.txt 失败", () => {
  it("缺少 Sitemap 指令", () => {
    const r = verifySitemapRobots({
      robotsText: `User-agent: *\nAllow: /\n`,
      sitemapText: minimalSitemap(),
    });
    expect(r.ok).toBe(false);
    expect(r.message).toMatch(/robots\.txt 缺少 `Sitemap:` 指令/);
  });

  it("多个不同的 Sitemap URL", () => {
    const robotsText = `User-agent: *\nAllow: /\nSitemap: https://a.com/sitemap.xml\nSitemap: https://b.com/sitemap.xml\n`;
    const r = verifySitemapRobots({ robotsText, sitemapText: minimalSitemap() });
    expect(r.ok).toBe(false);
    expect(r.message).toContain("声明了多个不同的 Sitemap URL");
    expect(r.message).toContain("https://a.com/sitemap.xml");
    expect(r.message).toContain("https://b.com/sitemap.xml");
  });

  it("Sitemap URL 非法", () => {
    const r = verifySitemapRobots({
      robotsText: `Sitemap: not-a-url\n`,
      sitemapText: minimalSitemap(),
    });
    expect(r.ok).toBe(false);
    expect(r.message).toContain("Sitemap URL 非法");
  });

  it("Sitemap 路径不是 /sitemap.xml", () => {
    const r = verifySitemapRobots({
      robotsText: `Sitemap: https://example.com/sitemaps/main.xml\n`,
      sitemapText: minimalSitemap(),
    });
    expect(r.ok).toBe(false);
    expect(r.message).toContain("但项目中的 sitemap 位于 /sitemap.xml");
  });

  it("User-agent: * 下 Disallow: / 与 Sitemap 并存", () => {
    const robotsText = `User-agent: *\nDisallow: /\n\nSitemap: https://example.com/sitemap.xml\n`;
    const r = verifySitemapRobots({ robotsText, sitemapText: minimalSitemap() });
    expect(r.ok).toBe(false);
    expect(r.message).toContain("全站屏蔽");
    expect(r.message).toContain("自相矛盾");
  });
});

describe("verifySitemapRobots — sitemap.xml 失败", () => {
  it("无 <loc> 条目", () => {
    const sitemapText = `<?xml version="1.0"?>\n<urlset></urlset>`;
    const r = verifySitemapRobots({ robotsText: minimalRobots(), sitemapText });
    expect(r.ok).toBe(false);
    expect(r.message).toContain("未包含任何 <loc>");
  });

  it("<loc> 是非法 URL", () => {
    const r = verifySitemapRobots({
      robotsText: minimalRobots(),
      sitemapText: minimalSitemap(["not-a-url"]),
    });
    expect(r.ok).toBe(false);
    expect(r.message).toContain("存在非法 URL");
  });

  it("<loc> 域名与 robots Sitemap 域名不一致：格式化差异输出", () => {
    const r = verifySitemapRobots({
      robotsText: minimalRobots("https://example.com/sitemap.xml"),
      sitemapText: minimalSitemap([
        "https://other.com/a",
        "https://example.com/ok",
        "https://another.com/b",
      ]),
    });
    expect(r.ok).toBe(false);
    expect(r.message).toMatch(
      /^sitemap\.xml 中以下 URL 与 robots\.txt Sitemap 域名 \(https:\/\/example\.com\) 不一致：/,
    );
    expect(r.message).toContain("\n  - https://other.com/a");
    expect(r.message).toContain("\n  - https://another.com/b");
    expect(r.message).not.toContain("https://example.com/ok");
  });
});

describe("verifySitemapRobots — CLI 输出格式", () => {
  function runInFixture(robots: string, sitemap: string) {
    const dir = mkdtempSync(join(tmpdir(), "vsr-"));
    mkdirSync(join(dir, "public"));
    writeFileSync(join(dir, "public/robots.txt"), robots);
    writeFileSync(join(dir, "public/sitemap.xml"), sitemap);
    return spawnSync("bunx", ["tsx", SCRIPT_PATH], {
      cwd: dir,
      encoding: "utf8",
    });
  }

  it("失败时 stderr 前缀为 `[verify-sitemap-robots] ✗ ` 且退出码 1", () => {
    const res = runInFixture(`User-agent: *\nAllow: /\n`, minimalSitemap());
    expect(res.status).toBe(1);
    expect(res.stderr.startsWith("[verify-sitemap-robots] ✗ ")).toBe(true);
    expect(res.stderr).toContain("robots.txt 缺少 `Sitemap:` 指令");
  });

  it("域名不一致时 CLI 输出包含格式化差异清单", () => {
    const res = runInFixture(
      minimalRobots("https://example.com/sitemap.xml"),
      minimalSitemap(["https://other.com/a"]),
    );
    expect(res.status).toBe(1);
    expect(res.stderr).toContain("[verify-sitemap-robots] ✗ ");
    expect(res.stderr).toContain("(https://example.com)");
    expect(res.stderr).toContain("\n  - https://other.com/a");
  });

  it("合法输入时退出码 0，stdout 输出 ✓ 日志", () => {
    const res = runInFixture(minimalRobots(), minimalSitemap());
    expect(res.status).toBe(0);
    expect(res.stdout).toContain("[verify-sitemap-robots] ✓");
  });
});
