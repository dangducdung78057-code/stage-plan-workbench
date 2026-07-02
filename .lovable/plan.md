
## Scope

Upgrade `src/pages/Exports.tsx` so existing `export_records` rows can be downloaded as real `.md` and `.pdf` files. No changes to project creation, confirmation, mock generation, or the export-record persistence flow. No new tables, no new edge functions.

## 1. Feature flag

New file `src/lib/featureFlags.ts` — reads flags from `localStorage` with defaults `false`. Flags: `pdfExport`, `markdownDownload`, `pngExport`, `storageUpload`, `aiProvider`, `payments`, `procurement`.

In `src/pages/Settings.tsx`, add a "分支能力开关 (v2.x)" panel with toggles that write to the same localStorage keys. Only `markdownDownload` and `pdfExport` are wired this turn; the other four are visible but disabled with a "计划中" tag. Main flow stays on baseline when flags are off.

## 2. Markdown download

- Compose Markdown text from the existing `payload` on the record. If `format === 'markdown'`, use `payload` directly; if `format === 'json'`, parse and pass through the same renderer used below so JSON records also produce a usable `.md`.
- New helper `src/lib/exportRender.ts` with `renderMarkdown(payload, project)` producing sections: 项目信息 / 匿名学生数据 / 服装方案 / 风险列表 / Plan B / 倒排时间表 / 采购搜索建议 / mock 声明 / 隐私声明摘要. Missing sections render as `_（本快照缺少此字段）_` — never throw.
- Filename: `stageos-{slug(projectTitle)}-v{version}-{yyyyMMddHHmm}.md`. `slug()` strips whitespace/punct and falls back to `project_id.slice(0,8)`.
- Download via `Blob([text], { type: 'text/markdown;charset=utf-8' })` + object URL + `a.download` + `URL.revokeObjectURL`.

## 3. PDF download (print-window fallback approach)

Chinese-safe strategy: skip jsPDF/embedded fonts entirely. Render the Markdown-derived content into a hidden `<iframe>` with a print-friendly HTML template using system Chinese fonts (`-apple-system, "PingFang SC", "Microsoft YaHei", "Noto Sans CJK SC", sans-serif`), then call `iframe.contentWindow.print()`. User picks "另存为 PDF" from the browser print dialog. This guarantees horizontal Chinese, no bundled commercial fonts, no font-license risk.

- Helper `src/lib/exportRender.ts` → `renderPrintableHtml(payload, project, { title })`. Returns a full HTML doc with `<title>` matching the target PDF filename so most browsers default the save filename.
- Trigger: `openPrintWindow(html)` creates a same-origin `<iframe>` appended off-screen, writes HTML, waits for `load`, calls `print()`, removes the iframe after `afterprint`.
- If `window.print` is unavailable or throws (rare in-app webview), catch and toast: `"PDF 生成失败，请先下载 Markdown。"`
- No jsPDF dependency added.

## 4. Ownership + auth guard

- `Exports.tsx` already relies on RLS (`export_records` policies scope to `auth.uid()`), so the initial `select *` only returns rows the user owns. Keep it.
- Before any download, re-check: `supabase.auth.getUser()` — if null, toast "请先登录" and abort.
- Additionally re-verify project ownership at click time by selecting `projects.user_id where id = row.project_id` and comparing to `user.id`; if mismatch or no row, toast "无权下载此记录" and abort. This defends against a stale row from a client-side tampered state.
- No `download` action is written to `export_records` (per spec: "不一定新增"). Choose not to insert to keep the record list clean; downloads are ephemeral.

## 5. Empty-payload + error UX

- If `!row.payload || row.payload.length === 0`: toast "暂无可下载载荷，请先导出。" and abort.
- All handlers wrapped in `try/catch` → `toast.error(...)`; never re-throw. RootErrorBoundary stays quiet.

## 6. UI changes (Exports.tsx only)

Desktop table row action cell — replace single "查看" button with a compact button group: `查看` / `下载 MD` / `下载 PDF`. Flag-gated buttons hide when their flag is off. Buttons visible only when `pdfExport`/`markdownDownload` are enabled in Settings.

Mobile `MobileCard` footer — replace single link with a vertical stack of full-width buttons: `查看载荷` / `下载 Markdown` / `下载 PDF`. Uses `flex flex-col gap-2` so nothing gets truncated at 376px width. Version / time / size fields unchanged.

## 7. Acceptance walkthrough

1. Toggle both flags on in Settings → return to `/exports`.
2. Click `下载 MD` on a markdown record → `.md` file downloads with all 9 sections; Chinese renders horizontally in any editor.
3. Click `下载 PDF` → print dialog opens with rendered Chinese content; "另存为 PDF" produces a valid PDF.
4. Sign out → visiting `/exports` redirects to `/auth` (existing `ProtectedRoute`).
5. Sign in as account B → account A's rows are not listed (RLS) and even if forged, ownership recheck aborts the download.
6. Refresh → records persist (unchanged storage).
7. Project create / confirm / generate / snapshot / export flows untouched.

## Technical notes

- No new npm packages. No new tables. No new edge function.
- Files touched: `src/pages/Exports.tsx`, `src/pages/Settings.tsx`, new `src/lib/featureFlags.ts`, new `src/lib/exportRender.ts`.
- `src/lib/stageos.ts` `STAGEOS_VERSION` unchanged — this is an additive branch feature, not a baseline bump.
