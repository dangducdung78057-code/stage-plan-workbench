## 目标

为 `scripts/verify-sitemap-robots.ts` 增加 Vitest 单元测试，覆盖 robots.txt / sitemap.xml 的各类正常与异常场景，并断言失败时的错误输出格式（前缀 `[verify-sitemap-robots] ✗`、包含关键字段）。

## 方案

采用**重构 + 子进程**结合的方式，尽量贴近现有代码风格且不破坏 `prebuild` 行为：

### 1. 轻量重构 `scripts/verify-sitemap-robots.ts`

将当前"顶层立即执行"改为导出一个纯函数 + 独立入口：

- 导出 `verifySitemapRobots({ robotsText, sitemapText }): { ok: true } | { ok: false, message: string }`
  - 纯函数，不读文件、不调用 `process.exit`、不打印。
  - 保留现有全部校验规则与中文错误文案。
- 保留一个 `main()`：读取 `public/robots.txt` 与 `public/sitemap.xml`，调用纯函数；
  - 成功 → 打印现有 ✓ 日志；
  - 失败 → 打印 `[verify-sitemap-robots] ✗ ${message}` 并 `process.exit(1)`。
- 通过 `import.meta` 入口守卫，仅在直接 `bunx tsx` 执行时调用 `main()`，被测试 import 时不触发。

`package.json` 的 `prebuild` / `verify:sitemap` 脚本无需改动。

### 2. 新增 `scripts/verify-sitemap-robots.test.ts`

使用 Vitest（项目已配置 `vitest.config.ts`，默认扫描 `src/**`），需要将 `include` 扩到 `scripts/**`，或把测试文件放在 `src/test/verify-sitemap-robots.test.ts` 并 `import` 相对路径。**首选后者**——不改 vitest 配置，测试文件放在 `src/test/verify-sitemap-robots.test.ts`，`import { verifySitemapRobots } from "../../scripts/verify-sitemap-robots"`。

覆盖用例：

**成功用例**
1. 当前项目真实 `public/robots.txt` + `public/sitemap.xml`（用 `readFileSync` 读入）→ 断言 `ok: true`，作为回归基线。
2. 最小合法组合：单条 `Sitemap:` + 单个 `<loc>`，同域。

**robots.txt 失败用例**
3. 缺少 `Sitemap:` 指令 → `message` 匹配 `/robots\.txt 缺少 `Sitemap:` 指令/`。
4. 多个不同的 `Sitemap:` URL → 包含 `声明了多个不同的 Sitemap URL`，且列出两个 URL。
5. `Sitemap:` URL 非法（如 `not-a-url`）→ 包含 `Sitemap URL 非法`。
6. `Sitemap:` 路径不是 `/sitemap.xml`（如 `/sitemaps/main.xml`）→ 包含 `但项目中的 sitemap 位于 /sitemap.xml`。
7. `User-agent: *` 下 `Disallow: /` 与 `Sitemap:` 并存 → 包含 `全站屏蔽`、`自相矛盾`。
8. 仅 `User-agent: Googlebot` 出现 `Disallow: /`（`*` 无禁用）→ 不应触发全站屏蔽错误（回归，验证 UA 作用域）。

**sitemap.xml 失败用例**
9. 无 `<loc>` 条目 → 包含 `未包含任何 <loc>`。
10. `<loc>` 是非法 URL → 包含 `存在非法 URL`。
11. `<loc>` 域名与 robots Sitemap 域名不一致 → 断言 message：
    - 以 `sitemap.xml 中以下 URL 与 robots.txt Sitemap 域名` 开头，
    - 包含期望域名 `(https://example.com)`，
    - 并按 `\n  - ` 前缀列出所有不匹配 URL（顺序与输入一致）。

**输出格式断言**
12. 针对至少 3 个失败用例，额外断言 `main()` 命令行输出格式：通过 `child_process.spawnSync("bunx", ["tsx", scriptPath], { cwd: tmpdir })` 在 fixture 目录（临时目录内含 mock 的 `public/robots.txt` 与 `public/sitemap.xml`）运行，断言：
    - `status === 1`；
    - `stderr` 以 `[verify-sitemap-robots] ✗ ` 开头；
    - `stderr` 包含对应错误关键字。
   这一部分单独放在 `describe("CLI output", ...)` 中，其余为纯函数测试。

### 3. 运行

`bunx vitest run src/test/verify-sitemap-robots.test.ts` 验证全部通过；同时 `bun run verify:sitemap` 应继续对真实文件通过。

## 技术细节

- 纯函数签名：
  ```ts
  export type VerifyResult = { ok: true } | { ok: false; message: string };
  export function verifySitemapRobots(input: {
    robotsText: string;
    sitemapText: string;
  }): VerifyResult;
  ```
- 入口守卫：
  ```ts
  const isDirectRun = import.meta.url === `file://${process.argv[1]}`;
  if (isDirectRun) main();
  ```
- CLI 测试使用 Node 内置 `fs.mkdtempSync(os.tmpdir()+"/vsr-")` 建临时 `public/` 目录，用 `spawnSync` 运行仓库内脚本并通过 `cwd` 指向临时目录（脚本用 `process.cwd()` 解析路径，天然支持）。
- 不修改 `vitest.config.ts`、不新增依赖。
