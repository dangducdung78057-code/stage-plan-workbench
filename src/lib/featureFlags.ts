import { useEffect, useState } from "react";

export type FeatureFlag =
  | "markdownDownload"
  | "pdfExport"
  | "pngExport"
  | "storageUpload"
  | "aiProvider"
  | "payments"
  | "procurement";

const KEY = "stageos.featureFlags.v1";

const DEFAULTS: Record<FeatureFlag, boolean> = {
  markdownDownload: true,
  pdfExport: false,
  pngExport: false,
  storageUpload: false,
  aiProvider: false,
  payments: false,
  procurement: false,
};

export const FLAG_META: Record<FeatureFlag, { label: string; desc: string; wired: boolean }> = {
  markdownDownload: { label: "Markdown 真实下载", desc: "导出页启用 .md 文件浏览器下载。", wired: true },
  pdfExport: { label: "PDF 导出（实验版）", desc: "实验中：强制开启后按钮显示为「PDF 实验版」。若渲染结果为空白将被拦截，不生成文件也不上传 Storage。", wired: false },
  pngExport: { label: "PNG 图片导出", desc: "html-to-image 将排产快照渲染为分享用长图 PNG。", wired: true },
  storageUpload: { label: "Storage 文件存储", desc: "私有 bucket 持久化导出的 MD / PDF，按 user_id 前缀隔离，生成签名 URL。", wired: true },
  aiProvider: { label: "AI 生成 provider", desc: "计划中：替换 mockPlan.ts 为真实模型。", wired: false },
  payments: { label: "支付与会员", desc: "计划中：Stripe / Paddle。", wired: false },
  procurement: { label: "采购 API", desc: "计划中：真实/半自动采购清单。", wired: false },
};

function read(): Record<FeatureFlag, boolean> {
  if (typeof localStorage === "undefined") return { ...DEFAULTS };
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return { ...DEFAULTS };
    return { ...DEFAULTS, ...JSON.parse(raw) };
  } catch {
    return { ...DEFAULTS };
  }
}

export function getFlag(f: FeatureFlag): boolean {
  return read()[f];
}

export function setFlag(f: FeatureFlag, v: boolean) {
  const next = { ...read(), [f]: v };
  localStorage.setItem(KEY, JSON.stringify(next));
  window.dispatchEvent(new CustomEvent("stageos:flags"));
}

export function useFlags(): Record<FeatureFlag, boolean> {
  const [flags, setFlags] = useState<Record<FeatureFlag, boolean>>(() => read());
  useEffect(() => {
    const sync = () => setFlags(read());
    window.addEventListener("stageos:flags", sync);
    window.addEventListener("storage", sync);
    return () => {
      window.removeEventListener("stageos:flags", sync);
      window.removeEventListener("storage", sync);
    };
  }, []);
  return flags;
}
