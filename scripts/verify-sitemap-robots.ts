/**
 * 构建时校验：public/sitemap.xml 与 public/robots.txt 一致性。
 *
 * 校验规则：
 * 1. robots.txt 必须声明 Sitemap 指令，且指向 public/sitemap.xml 中使用的同一域名。
 * 2. sitemap.xml 中所有 <loc> 的 origin 必须与 robots.txt 中 Sitemap 域名一致。
 * 3. robots.txt 中不得同时出现全局 `Disallow: /`（对 `User-agent: *`）与非空 sitemap，
 *    避免"全站禁爬 + 提交 sitemap"的矛盾配置。
 *
 * 校验失败时以非零退出码终止，供 CI / prebuild 阻断构建。
 */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";

export interface VerifyResult {
  ok: boolean;
  message: string;
}
const OK: VerifyResult = { ok: true, message: "" };
const fail = (message: string): VerifyResult => ({ ok: false, message });

export function verifySitemapRobots(input: {
  robotsText: string;
  sitemapText: string;
}): VerifyResult {
  const { robotsText, sitemapText } = input;

  const sitemapDirectives = [
    ...robotsText.matchAll(/^\s*Sitemap:\s*(\S+)\s*$/gim),
  ].map((m) => m[1]);
  if (sitemapDirectives.length === 0) {
    return { ok: false, message: "robots.txt 缺少 `Sitemap:` 指令。" };
  }
  if (new Set(sitemapDirectives).size > 1) {
    return {
      ok: false,
      message: `robots.txt 声明了多个不同的 Sitemap URL：${sitemapDirectives.join(", ")}`,
    };
  }
  const robotsSitemapUrl = sitemapDirectives[0];

  let robotsSitemapOrigin: string;
  let robotsSitemapPath: string;
  try {
    const u = new URL(robotsSitemapUrl);
    robotsSitemapOrigin = u.origin;
    robotsSitemapPath = u.pathname;
  } catch {
    return {
      ok: false,
      message: `robots.txt 中的 Sitemap URL 非法：${robotsSitemapUrl}`,
    };
  }

  if (robotsSitemapPath !== "/sitemap.xml") {
    return {
      ok: false,
      message: `robots.txt Sitemap 指向 ${robotsSitemapPath}，但项目中的 sitemap 位于 /sitemap.xml。`,
    };
  }

  const uaBlocks = robotsText.split(/^\s*User-agent:/gim).slice(1);
  for (const block of uaBlocks) {
    const [firstLine, ...rest] = block.split("\n");
    const agent = firstLine.trim();
    if (agent !== "*") continue;
    const body = rest.join("\n");
    const disallowAll = /^\s*Disallow:\s*\/\s*$/im.test(body);
    if (disallowAll) {
      return {
        ok: false,
        message:
          "robots.txt 对 `User-agent: *` 使用 `Disallow: /` 全站屏蔽，却同时声明了 Sitemap，配置自相矛盾。",
      };
    }
  }

  const locs = [...sitemapText.matchAll(/<loc>\s*([^<\s]+)\s*<\/loc>/gi)].map(
    (m) => m[1],
  );
  if (locs.length === 0) {
    return { ok: false, message: "sitemap.xml 未包含任何 <loc> 条目。" };
  }

  const mismatched: string[] = [];
  for (const loc of locs) {
    let origin: string;
    try {
      origin = new URL(loc).origin;
    } catch {
      return { ok: false, message: `sitemap.xml 中存在非法 URL：${loc}` };
    }
    if (origin !== robotsSitemapOrigin) {
      mismatched.push(loc);
    }
  }
  if (mismatched.length > 0) {
    return {
      ok: false,
      message: `sitemap.xml 中以下 URL 与 robots.txt Sitemap 域名 (${robotsSitemapOrigin}) 不一致：\n  - ${mismatched.join(
        "\n  - ",
      )}`,
    };
  }

  return { ok: true };
}

function main(): void {
  const ROOT = resolve(process.cwd());
  const ROBOTS_PATH = resolve(ROOT, "public/robots.txt");
  const SITEMAP_PATH = resolve(ROOT, "public/sitemap.xml");

  let robotsText: string;
  let sitemapText: string;
  try {
    robotsText = readFileSync(ROBOTS_PATH, "utf8");
  } catch {
    console.error(`[verify-sitemap-robots] ✗ 无法读取 robots.txt: ${ROBOTS_PATH}`);
    process.exit(1);
  }
  try {
    sitemapText = readFileSync(SITEMAP_PATH, "utf8");
  } catch {
    console.error(`[verify-sitemap-robots] ✗ 无法读取 sitemap.xml: ${SITEMAP_PATH}`);
    process.exit(1);
  }

  const result = verifySitemapRobots({ robotsText, sitemapText });
  if (!result.ok) {
    console.error(`[verify-sitemap-robots] ✗ ${result.message}`);
    process.exit(1);
  }

  const locs = [...sitemapText.matchAll(/<loc>\s*([^<\s]+)\s*<\/loc>/gi)];
  const origin = new URL(
    [...robotsText.matchAll(/^\s*Sitemap:\s*(\S+)\s*$/gim)][0][1],
  ).origin;
  console.log(
    `[verify-sitemap-robots] ✓ robots.txt 与 sitemap.xml 一致（域名 ${origin}，共 ${locs.length} 条 URL）。`,
  );
}

const isDirectRun =
  typeof process.argv[1] === "string" &&
  import.meta.url === `file://${process.argv[1]}`;
if (isDirectRun) {
  main();
}
