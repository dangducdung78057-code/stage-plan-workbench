## 现象
刷新后手机白屏，控制台空白。本地 headless 验证应用能正常渲染到 `/auth`，说明代码没崩，是**兜底 UI 不足**加上**预览域名鉴权**共同造成的观感白屏。

## 可能原因
1. Lovable 的 `id-preview--*.lovable.app` 预览链接需要在同一浏览器中登录 Lovable 账号；未登录时会看到接近空白的中间页。这不是应用 bug，请在手机浏览器里先登录一次 Lovable。
2. `AuthProvider` 首次拉 session 期间，`ProtectedRoute` / `Auth` 只渲染一行「加载中…」的小字，手机上视觉上接近白屏。
3. 全应用没有顶层 ErrorBoundary，任何渲染期异常直接空 body，控制台里在生产 preview 里也未必看得到。

## 计划改动（仅前端表现层）

1. **顶层加载兜底**：`src/hooks/useAuth.tsx` 保持逻辑不变；在 `src/components/ProtectedRoute.tsx` 与 `src/pages/Auth.tsx` 里把 loading 态换成全屏居中的骨架：StageOS logo + 「正在恢复会话…」+ spinner，覆盖 `min-h-screen bg-background`，避免手机上像白屏。

2. **全局错误边界**：新增 `src/components/RootErrorBoundary.tsx`（class 组件），在 `src/App.tsx` 里包住 `<BrowserRouter>`。捕获后展示：错误摘要 + 「刷新」+「清除本地会话并重试」按钮（后者调用 `localStorage.clear()` 再 `location.reload()`，可自救 supabase token 损坏导致的死循环）。

3. **Auth 初始化超时保护**：`useAuth` 里给 `getSession()` 增加 6 秒超时，超时后强制 `setLoading(false)`（视为未登录，让路由跳转到 `/auth`），避免网络抖动时永久停在 loading。

4. **`/index` 兼容**：当前 `/index` 会命中 NotFound。加一条 `<Route path="/index" element={<Navigate to="/" replace />} />`，避免旧链接被记住时看到 404 觉得像白屏。

5. **不改动**：认证/RLS/edge function/数据库结构 —— 保持 v2 后端化不变。

## 用户侧建议（非代码）
- 手机浏览器先访问 `lovable.dev` 登录一次，再打开预览链接。
- 若仍白屏，长按刷新或访问 `/auth`，走新的错误边界的「清除本地会话并重试」按钮。

## 验收
- headless playwright 访问 `/`、`/index`、`/projects`：都能看到 loading 骨架或跳转到 `/auth`，不再有 body 为空的情况。
- 手动在 localStorage 塞一个坏的 `sb-*-auth-token` 后刷新，应能看到错误边界界面而不是白屏。
