/**
 * 构建时校验：public/sitemap.xml 与 public/robots.txt 一致性。
 *
 * 校验规则：
 * 1. robots.txt 必须至少声明一条 `Sitemap:` 指令，且所有指令均为合法 URL。
 * 2. robots.txt 中所有 `Sitemap:` URL、以及 sitemap.xml 中所有 <loc>
 *    必须共用同一个 origin（跨文件同域）。
 * 3. robots.txt 的 `Sitemap:` URL 集合 必须与项目中实际存在的 sitemap 文件
 *    集合完全一致（当前唯一文件为 public/sitemap.xml → `${origin}/sitemap.xml`）；
 *    差异会作为 "仅在 robots" / "仅在磁盘" 的明细逐条打印。
 * 4. sitemap.xml 中 <loc> 数组不得为空；每条 URL 需合法。
 * 5. `User-agent: *` 若设置 `Disallow: /`，与非空 sitemap 冲突，判定失败。
 *
 * 校验失败时以非零退出码终止，供 CI / prebuild 阻断构建。
 */


import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const ROOT = resolve(process.cwd());
const ROBOTS_PATH = resolve(ROOT, "public/robots.txt");
const SITEMAP_PATH = resolve(ROOT, "public/sitemap.xml");

const errors: string[] = [];

function report(msg: string) {
  errors.push(msg);
}

function readFileOrFail(path: string, label: string): string {
  try {
    return readFileSync(path, "utf8");
  } catch {
    console.error(`[verify-sitemap-robots] ✗ 无法读取 ${label}: ${path}`);
    process.exit(1);
  }
}

const robotsText = readFileOrFail(ROBOTS_PATH, "robots.txt");
const sitemapText = readFileOrFail(SITEMAP_PATH, "sitemap.xml");

// ---------- 解析 robots.txt ----------
const robotsSitemapUrls = [
  ...robotsText.matchAll(/^\s*Sitemap:\s*(\S+)\s*$/gim),
].map((m) => m[1]);

if (robotsSitemapUrls.length === 0) {
  report("robots.txt 缺少 `Sitemap:` 指令。");
}

const robotsOrigins = new Set<string>();
for (const url of robotsSitemapUrls) {
  try {
    robotsOrigins.add(new URL(url).origin);
  } catch {
    report(`robots.txt 中的 Sitemap URL 非法：${url}`);
  }
}
if (robotsOrigins.size > 1) {
  report(
    `robots.txt 中的 Sitemap 指令跨越多个域名：${[...robotsOrigins].join(", ")}`,
  );
}

// User-agent: * + Disallow: / 与 sitemap 冲突
const uaBlocks = robotsText.split(/^\s*User-agent:/gim).slice(1);
for (const block of uaBlocks) {
  const [firstLine, ...rest] = block.split("\n");
  if (firstLine.trim() !== "*") continue;
  if (/^\s*Disallow:\s*\/\s*$/im.test(rest.join("\n"))) {
    report(
      "robots.txt 对 `User-agent: *` 使用 `Disallow: /` 全站屏蔽，却同时声明 Sitemap，配置自相矛盾。",
    );
  }
}

// ---------- 解析 sitemap.xml ----------
const sitemapLocs = [
  ...sitemapText.matchAll(/<loc>\s*([^<\s]+)\s*<\/loc>/gi),
].map((m) => m[1]);

if (sitemapLocs.length === 0) {
  report("sitemap.xml 未包含任何 <loc> 条目。");
}

const sitemapOrigins = new Set<string>();
for (const loc of sitemapLocs) {
  try {
    sitemapOrigins.add(new URL(loc).origin);
  } catch {
    report(`sitemap.xml 中存在非法 URL：${loc}`);
  }
}

// 跨文件同域校验
if (robotsOrigins.size === 1 && sitemapOrigins.size >= 1) {
  const [robotsOrigin] = robotsOrigins;
  const outsiders = [...sitemapOrigins].filter((o) => o !== robotsOrigin);
  if (outsiders.length > 0) {
    report(
      `sitemap.xml 中的 URL 域名与 robots.txt Sitemap 域名 (${robotsOrigin}) 不一致：${outsiders.join(", ")}`,
    );
  }
}

// ---------- robots.txt Sitemap 条目 ↔ 磁盘上的 sitemap 文件 数组比对 ----------
// 当前项目中实际存在的 sitemap 文件：public/sitemap.xml
// 期望 robots.txt 声明的 Sitemap URL 集合 = { `${origin}/sitemap.xml` }
const expectedRobotsSitemapUrls = new Set<string>();
for (const origin of robotsOrigins) {
  expectedRobotsSitemapUrls.add(`${origin}/sitemap.xml`);
}
// 若 robots.txt 无有效 origin，退回到 sitemap.xml <loc> 的 origin
if (expectedRobotsSitemapUrls.size === 0) {
  for (const origin of sitemapOrigins) {
    expectedRobotsSitemapUrls.add(`${origin}/sitemap.xml`);
  }
}

const declaredRobotsSet = new Set(robotsSitemapUrls);
const onlyInRobots = [...declaredRobotsSet]
  .filter((u) => !expectedRobotsSitemapUrls.has(u))
  .sort();
const onlyOnDisk = [...expectedRobotsSitemapUrls]
  .filter((u) => !declaredRobotsSet.has(u))
  .sort();

if (onlyInRobots.length > 0 || onlyOnDisk.length > 0) {
  const lines: string[] = [
    "robots.txt 的 `Sitemap:` 条目与项目中实际的 sitemap 文件不一致。",
  ];
  if (onlyInRobots.length > 0) {
    lines.push("  仅在 robots.txt 中声明（磁盘无对应文件）：");
    for (const u of onlyInRobots) lines.push(`    - ${u}`);
  }
  if (onlyOnDisk.length > 0) {
    lines.push("  仅在磁盘存在（robots.txt 未声明）：");
    for (const u of onlyOnDisk) lines.push(`    + ${u}`);
  }
  report(lines.join("\n"));
}


// ---------- 汇总 ----------
if (errors.length > 0) {
  for (const e of errors) console.error(`[verify-sitemap-robots] ✗ ${e}`);
  process.exit(1);
}

console.log(
  `[verify-sitemap-robots] ✓ robots.txt ↔ sitemap.xml 一致（域名 ${[...robotsOrigins][0]}，sitemap 文件 ${robotsSitemapUrls.length} 条，<loc> ${sitemapLocs.length} 条）。`,
);

