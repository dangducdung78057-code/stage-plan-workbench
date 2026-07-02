## 目标

修复手机端 (<768px) 表格挤压/竖排问题：所有 `ops-table` 在移动端渲染为卡片列表，桌面端保留现有表格。**不改动**后端、Supabase 查询、mock provider、隐私确认逻辑。

## 方案总览

新增一个共享的响应式模式：
- 桌面 (`md:`+): 现有 `<table class="ops-table">` 原样保留。
- 移动 (`<md`): 隐藏表格，改渲染同数据源的 `<ul>` 卡片列表。

使用 Tailwind `hidden md:block` / `md:hidden` 切换，无需 JS 判断视口 → 服务端/客户端一致，无闪烁。

新增一个 `MobileCard` / `MobileCardList` 轻量原语放在 `src/components/MobileCard.tsx`，样式：
- `rounded-md border bg-card p-3 space-y-1.5 text-sm`
- 每行 `flex items-center justify-between gap-3`，label `text-xs text-muted-foreground whitespace-nowrap`，value `text-right min-w-0 truncate`（长文本改成 `flex-col` 竖向标签+值）。
- 卡片根 `min-w-0`，容器 `space-y-2`。

关键：卡片本体宽度 = 屏幕宽 - 外边距，文本 `break-words` 而不是列宽压缩，杜绝竖排。

## 需要改造的表格

### 1. 项目列表卡片
- `src/pages/Projects.tsx` (主列表)
- `src/pages/Workspace.tsx` (Top 10 摘要)

每卡片展示：标题（主标题行）、状态徽章、演出日期、人数、更新时间、操作（"打开 / 编辑" 链接）。

### 2. 导出记录 (Exports)
- `src/pages/Exports.tsx`

每卡片：项目、格式徽章、大小、创建时间、下载操作。

### 3. 项目详情内嵌表 (`ProjectDetail.tsx`)
四张 `ops-table`，逐一提供移动卡片版：

- **计划快照列表** (L187)：版本 / 模式 / 生成时间 / 合计
- **确认记录列表** (L226)：状态 / 备注 / 时间
- **倒排时间表** (L379)：D-day / 日期 / 任务 / 负责人
- **平台搜索渠道表** (L403)：平台 / 关键词 / 打开链接 / 说明
- **服装预算表** (L426)：项 / 数量 / 单价 / 小计
  - 按用户要求：移动端拆成 **女生方案 / 男生方案 / 配饰** 三个纵向区块，各区块独立标题 + 卡片列表 + 小计行。桌面表格结构不变（仍是一张合计表）。
  - 数据来源已是 `femalePlan / malePlan / accessories`，直接分组渲染即可。

### 4. 其他表格（同样处理，非用户点名但同问题）
- `ProjectEditor.tsx` L224 学生名单表 → 卡片：学号 / 性别 / 身高 / 角色
- `ProjectWizard.tsx` L928 名单预览表 → 卡片同上

## 实施步骤

1. 新建 `src/components/MobileCard.tsx`：导出 `<MobileCard>` 与 `<MobileField label value />`。
2. 各页面：把每处 `<div class="overflow-x-auto"><table>…</table></div>` 用一个包装组件替换为：
   ```
   <div class="hidden md:block overflow-x-auto"> <table … /> </div>
   <ul class="md:hidden space-y-2 p-3"> {rows.map(...卡片)} </ul>
   ```
3. 服装预算表移动端分三段渲染 (`femalePlan` / `malePlan` / `accessories`)，桌面端保留合并表。
4. 卡片内每个字段都用 `flex justify-between`，中文值 `break-words`，禁止 `whitespace-nowrap` 于长文本。空态与 loading 态在两个视图各自渲染一次。
5. 视觉自检：Playwright 在 375 / 430 / 768 三档截图 `/projects`、`/workspace`、`/exports`、`/projects/:id`，确认无竖排、无横向溢出。

## 非目标（不改）

- 数据库/表结构、RLS、Supabase 查询、mock plan 生成、隐私/确认状态机、路由、桌面端表格样式与列宽。
