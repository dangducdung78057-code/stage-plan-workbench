## 目标

只修 `src/pages/ProjectDetail.tsx` 移动端头部布局，桌面端保留原样。不动后端、确认流程、生成逻辑、快照/导出。

## 变更点（单文件：`src/pages/ProjectDetail.tsx`）

### 1. 外层容器（L184）
- 把 `p-6 space-y-4 max-w-6xl` 改成 `p-4 md:p-6 space-y-4 max-w-6xl min-w-0`，避免手机端 24px 内边距+按钮溢出。

### 2. 头部布局（L185–L208）重写为响应式
- 顶层 `flex items-start justify-between` → 改为 `flex flex-col gap-3 md:flex-row md:items-start md:justify-between`。
- 左侧标题区：
  - 「返回」按钮单独一行（`md:inline-flex` 保留旧行内），移动端放在标题上方独立一行，避免与标题挤在同一 flex 行导致标题被压成竖列。
  - 标题行改成 `flex flex-wrap items-center gap-2 min-w-0`；`<h1>` 加 `text-lg md:text-xl font-semibold break-words min-w-0 flex-1 leading-snug`，`StatusBadge` `shrink-0`。这保证中文标题横向换行而非竖排（根因：父 flex 未 `min-w-0`、`h1` 无 `min-w-0/flex-1`，被兄弟按钮挤到极窄宽度触发逐字换行）。
  - meta 行 `text-xs font-mono` 加 `break-all`。
- 右侧操作按钮区：`flex items-center gap-2` → `flex flex-col gap-2 w-full md:flex-row md:w-auto md:items-center`；两个 `<Button>` 加 `w-full md:w-auto justify-center`，「需确认」小徽标 `whitespace-nowrap`。这样手机端按钮上下堆叠、占满宽度、不再截断。

### 3. Meta 信息卡片网格（L254）
- `grid grid-cols-4 gap-3` → `grid grid-cols-2 md:grid-cols-4 gap-3`。
- 顺带确认 `MetaCard` 内的 label/value 用 `break-words`，不使用 `whitespace-nowrap`（若当前实现有 nowrap 则去掉，只改这个组件的样式，不改 API）。

### 4. Tabs（L261–L267）
- `TabsList` 外包一层 `<div className="overflow-x-auto -mx-4 px-4 md:mx-0 md:px-0">`，并给 `TabsList` 加 `w-max` 类，让手机端整条 tab 横向滚动而不换行/竖排。tab 文字内 `<span className="kbd-route">` 保持 `whitespace-nowrap`（本就 inline 短文本，横向滚动即可解决）。

### 5. 不改动
- 三个警告面板（confirmation / notice / issues）当前已是 flex 行内布局且文字会自然换行，不动。
- 桌面端所有间距、字号、行内排布保持不变（所有新类均带 `md:` 断点还原原样）。
- 后端接口、`handleGenerate`/`handleConfirm`/`handleExport`、快照/确认/导出/渲染 tabs 内容，一律不动。

## 验证

Playwright 在 375 / 430 / 768 三档打开一个真实项目详情：
- 375px：标题横向单行或多行换行，无逐字竖排；两个按钮上下堆叠且完整可见（未截断）；meta 4 项呈 2×2；tabs 横向可滚动；页面无水平溢出（`document.documentElement.scrollWidth <= innerWidth`）。
- 768px：与原桌面头部一致（返回+标题+状态同一行、按钮同一行右对齐、meta 4 列）。
