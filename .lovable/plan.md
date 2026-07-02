# v3.4 PDF 状态收口（pdf-tri-state-pass）

仅改造 PDF 一项检查与摘要输出。AI / Markdown / PNG / Procurement / Storage / Auth 一律不动。

## 目标

将 HealthCheck 中的 PDF 检查从"flag off → SKIP('flag off')"改为显式三态，并把状态原因写进「一键验收摘要」，避免只看到 `flag off` 无法判断是"用户关闭"还是"能力缺失"。

## 三态定义

| 状态 | 触发条件 | detail（UI 与摘要一致） |
|------|----------|------------------------|
| PASS  | flag ON + printable html 合法 + `renderPdfBlob` 返回 bytes>1024 | `PDF success — bytes=<n>` |
| SKIP  | flag OFF | `PDF disabled by config — pdfExport flag 未开启（Settings → 分支能力开关）` |
| WARN  | flag ON 但 html 校验失败、renderPdfBlob 抛错、或 bytes≤1024 | `PDF generation failed — <reason>`（原 fail 全部降级为 warn） |

关键点：
- flag off 不再写 `flag off` 这个含糊字符串；写"未启用原因 + 打开位置"。
- 原来的 `fail` 分支全部改为 `warn`，PDF 不再拉红整体结论。
- SKIP / WARN 都不参与 v3.3 结论判定（v3.3 只看 procurement 与 markdown/png/storage 相关检查已是 PASS）。

## 摘要输出增强

`buildSummaryText()` 在检查列表之后追加一段独立 PDF 状态块：

```text
PDF 模块状态:
  status: pass | skip | warn
  reason: PDF success | PDF disabled by config | PDF generation failed
  detail: bytes=<n> | pdfExport flag 未开启 | <error message>
```

通过在 push PDF 检查时同步记录 `(checks as any).__pdfDetail = { status, reason, detail }`，与已有的 `__providerDetail` 走同一模式，不新增状态管理。

## 涉及文件

- `src/components/HealthCheck.tsx`
  - 第 210–228 行 PDF 分支：改写为三态 + 结构化 detail，写入 `__pdfDetail`。
  - `buildSummaryText()`（491–522）：追加 "PDF 模块状态" 段落。
- 版本水印：`src/lib/stageos.ts` 中 `STAGEOS_VERSION` → `stageos-v3.4-pdf-tri-state-pass`；`src/index.css` checkpoint banner 同步。

## 不修改

AI 检查、Markdown 渲染、PNG 检查、Procurement provider / export / settings、Storage 副本、Auth / RLS、导出产物内容本身。PDF 生成实现（`renderPdfBlob`）保持原样，只调整判定与报告。

## 验收

在 Settings 中：
1. `pdfExport` OFF → 运行验收：PDF 行显示 `SKIP — PDF disabled by config …`，摘要含 "PDF 模块状态: status: skip"；v3.3 采购全链 PASS 结论保持。
2. `pdfExport` ON 正常路径 → PDF 行 `PASS — PDF success — bytes=<n>`。
3. 人为破坏（临时把 endpoint / html 弄坏或断网 jsPDF 资源） → PDF 行 `WARN — PDF generation failed — <msg>`，不出现 FAIL。
