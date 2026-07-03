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

const ROOT = resolve(process.cwd());
const ROBOTS_PATH = resolve(ROOT, "public/robots.txt");
const SITEMAP_PATH = resolve(ROOT, "public/sitemap.xml");

function fail(msg: string): never {
  console.error(`[verify-sitemap-robots] ✗ ${msg}`);
  process.exit(1);
}

function readFileOrFail(path: string, label: string): string {
  try {
    return readFileSync(path, "utf8");
  } catch {
    fail(`无法读取 ${label}: ${path}`);
  }
}

const robotsText = readFileOrFail(ROBOTS_PATH, "robots.txt");
const sitemapText = readFileOrFail(SITEMAP_PATH, "sitemap.xml");

// 1) 解析 robots.txt
const sitemapDirectives = [...robotsText.matchAll(/^\s*Sitemap:\s*(\S+)\s*$/gim)].map(
  (m) => m[1],
);
if (sitemapDirectives.length === 0) {
  fail("robots.txt 缺少 `Sitemap:` 指令。");
}
if (new Set(sitemapDirectives).size > 1) {
  fail(`robots.txt 声明了多个不同的 Sitemap URL：${sitemapDirectives.join(", ")}`);
}
const robotsSitemapUrl = sitemapDirectives[0];

let robotsSitemapOrigin: string;
let robotsSitemapPath: string;
try {
  const u = new URL(robotsSitemapUrl);
  robotsSitemapOrigin = u.origin;
  robotsSitemapPath = u.pathname;
} catch {
  fail(`robots.txt 中的 Sitemap URL 非法：${robotsSitemapUrl}`);
}

if (robotsSitemapPath !== "/sitemap.xml") {
  fail(
    `robots.txt Sitemap 指向 ${robotsSitemapPath}，但项目中的 sitemap 位于 /sitemap.xml。`,
  );
}

// 检查 User-agent: * 是否 Disallow: /
const uaBlocks = robotsText.split(/^\s*User-agent:/gim).slice(1);
for (const block of uaBlocks) {
  const [firstLine, ...rest] = block.split("\n");
  const agent = firstLine.trim();
  if (agent !== "*") continue;
  const body = rest.join("\n");
  const disallowAll = /^\s*Disallow:\s*\/\s*$/im.test(body);
  if (disallowAll) {
    fail(
      "robots.txt 对 `User-agent: *` 使用 `Disallow: /` 全站屏蔽，却同时声明了 Sitemap，配置自相矛盾。",
    );
  }
}

// 2) 解析 sitemap.xml <loc>
const locs = [...sitemapText.matchAll(/<loc>\s*([^<\s]+)\s*<\/loc>/gi)].map((m) => m[1]);
if (locs.length === 0) {
  fail("sitemap.xml 未包含任何 <loc> 条目。");
}

const mismatched: string[] = [];
for (const loc of locs) {
  let origin: string;
  try {
    origin = new URL(loc).origin;
  } catch {
    fail(`sitemap.xml 中存在非法 URL：${loc}`);
  }
  if (origin !== robotsSitemapOrigin) {
    mismatched.push(loc);
  }
}
if (mismatched.length > 0) {
  fail(
    `sitemap.xml 中以下 URL 与 robots.txt Sitemap 域名 (${robotsSitemapOrigin}) 不一致：\n  - ${mismatched.join(
      "\n  - ",
    )}`,
  );
}

console.log(
  `[verify-sitemap-robots] ✓ robots.txt 与 sitemap.xml 一致（域名 ${robotsSitemapOrigin}，共 ${locs.length} 条 URL）。`,
);
