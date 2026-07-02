# 采购候选商品 v1 · 本地模拟商品库

只读候选清单，无自动下单、无真实电商 API、无库存/价格承诺。作为独立 flag 分支交付，不改动 AI / mock / 导出 / Storage / Auth 主流程。

## 1. 数据源

新文件 `src/lib/procurementCatalog.ts` — 内置 TS 数据（避免 JSON import 兼容问题）。

结构：
```ts
type CatalogEntry = {
  categoryTags: string[];     // 匹配 plan item 的 category / description 关键词
  programTypes?: string[];    // 可选：适用节目类型（不填=通用）
  schoolStages?: string[];    // 可选：适用学段
  candidates: Candidate[];    // 该分类下预置 3 个以内候选
};

type Candidate = {
  platform: "taobao" | "1688" | "pinduoduo" | "jd" | "douyin";
  title: string;
  keyword: string;
  estimatedPrice: number;    // 单价估算
  matchReason: string;       // 为何匹配（如"合唱白衬衫 + 高中"）
  riskNote: string;          // 风险提示（如"码数偏小需实测"）
  url?: string;              // 可选，指向站内搜索页而非商品详情
};
```

覆盖服装类目：白衬衫、黑西裤、演出连衣裙、民族舞蹈服、爵士服、啦啦操服、白手套、领结、发饰、腰带、演出鞋等约 15-20 条 entry。

## 2. 匹配逻辑

`src/lib/procurementMatch.ts` 提供 `matchCandidates(item, ctx)`：

- 从 `item.category` + `item.description` 提取关键词
- 结合 `ctx.programType`、`ctx.schoolStage` 加权
- 从 catalog 中筛选，取 top 3
- 无匹配 → 返回 fallback：一条"通用平台搜索建议"（platform=taobao, keyword=拼接的 item 描述）
- 从不抛错

## 3. UI · 内嵌 ProjectDetail

在 `src/pages/ProjectDetail.tsx` 服装方案表格三段（女生/男生/配饰）的每行右侧加"查看候选"按钮：

- 点击展开该行下方一段候选卡片（Accordion / Collapsible）
- 卡片包含 3 张候选：platform badge、title、matchReason（灰色小字）、riskNote（黄色小字）、estimatedPrice、可选"打开搜索页"按钮
- 顶部横幅：**"候选商品为模拟/检索建议，非实时库存价格，需人工核验。"**
- 移动端：候选卡片改为纵向堆叠

不做人工确认/落库 — v1 纯只读浏览。confirm 状态留给下一版。

## 4. Feature flag

沿用 `src/lib/featureFlags.ts` 现有 `procurement` flag（当前 disabled 占位）：

- 默认 `false`
- Settings 面板将 procurement toggle 从"计划中"改为可开关
- flag off → ProjectDetail 完全不显示"查看候选"按钮和横幅，主流程零变化
- flag on → 显示候选功能

## 5. 明确不做（v1 边界）

- ❌ 不落库（无新表、不改 plan_snapshots、不改 export_records）
- ❌ 不出现在 Markdown / PDF / PNG 导出中（导出链路完全不动）
- ❌ 不调用任何外部 API（catalog 全离线）
- ❌ 不做自动下单、购物车、支付
- ❌ 不加载真实商品图片（避免版权/CORS）

## 6. 后续扩展点（不在本次实施）

- 真实 provider 适配器接口 `ProcurementProvider`（淘宝/1688/拼多多），通过 apiBaseUrl + 独立 flag 启用
- `procurement_selections` 表 + RLS，用于持久化人工确认
- 导出附加"已确认采购决策"章节

## 技术要点

**新文件**
- `src/lib/procurementCatalog.ts`
- `src/lib/procurementMatch.ts`
- `src/components/ProcurementCandidatesRow.tsx`（内嵌 Collapsible 卡片组）

**改动文件**
- `src/pages/ProjectDetail.tsx` — 在三张 plan 表格行末加按钮 + 折叠区
- `src/pages/Settings.tsx` — 激活 procurement flag 开关

**不动文件**
- `src/lib/exportRender.ts` / `src/pages/Exports.tsx` / `src/lib/exportStorage.ts`
- `supabase/functions/ai-generate-plan/index.ts` / `plan-precheck/index.ts`
- `src/lib/mockPlan.ts` / `src/hooks/useAuth.tsx`
- 数据库 schema 无迁移

**验收**
1. Settings 关闭 procurement → ProjectDetail 无候选入口、横幅、按钮
2. Settings 打开 procurement → 三张表每行出现"查看候选"，展开显示 ≤3 张卡片，含 platform/title/matchReason/riskNote/estimatedPrice
3. 横幅文案精确匹配："候选商品为模拟/检索建议，非实时库存价格，需人工核验。"
4. Markdown / PDF / PNG 导出内容与 v3 完全一致（回归导出链路一次即可）
5. 无候选匹配的项 → 显示 fallback"通用搜索建议"，不报错、不空白