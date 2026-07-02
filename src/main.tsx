import { createRoot } from "react-dom/client";
import "./index.css";

const rootElement = document.getElementById("root");

function showBootFallback(message = "页面加载失败，请刷新或清除本地会话后重试。") {
  if (!rootElement) return;
  rootElement.innerHTML = `
    <div style="min-height:100vh;display:grid;place-items:center;padding:16px;background:#f8fafc;color:#172033;font-family:-apple-system,BlinkMacSystemFont,'PingFang SC','Microsoft YaHei',sans-serif;">
      <div style="width:100%;max-width:380px;border:1px solid #dce3ec;border-radius:8px;background:#fff;padding:18px;box-shadow:0 8px 28px rgba(15,23,42,.08);">
        <div style="font-size:15px;font-weight:700;margin-bottom:8px;">StageOS 加载异常</div>
        <div style="font-size:13px;line-height:1.6;color:#5b6777;margin-bottom:14px;">${message}</div>
        <div style="display:grid;gap:8px;">
          <button id="stageos-reload" style="height:40px;border:1px solid #cbd5e1;border-radius:6px;background:#fff;color:#172033;font-size:14px;">刷新页面</button>
          <button id="stageos-reset" style="height:40px;border:0;border-radius:6px;background:#1d4f91;color:#fff;font-size:14px;">清除本地会话并重新登录</button>
        </div>
      </div>
    </div>`;
  document.getElementById("stageos-reload")?.addEventListener("click", () => window.location.reload());
  document.getElementById("stageos-reset")?.addEventListener("click", () => {
    try {
      Object.keys(window.localStorage)
        .filter((key) => key.startsWith("sb-") || key.startsWith("stageos"))
        .forEach((key) => window.localStorage.removeItem(key));
    } catch {}
    window.location.href = "/auth";
  });
}

showBootFallback("正在加载 StageOS 工作台…");

window.addEventListener("error", (event) => {
  if (!rootElement?.hasChildNodes()) showBootFallback(event.message || undefined);
});

window.addEventListener("unhandledrejection", (event) => {
  if (!rootElement?.hasChildNodes()) showBootFallback(String(event.reason || "页面加载失败，请刷新重试。"));
});

import("./App.tsx")
  .then(({ default: App }) => {
    if (!rootElement) throw new Error("Missing #root element");
    createRoot(rootElement).render(<App />);
  })
  .catch((error) => {
    console.error("[StageOS boot]", error);
    showBootFallback("页面模块加载失败，请刷新；如果仍然白屏，请清除本地会话并重新登录。");
  });
