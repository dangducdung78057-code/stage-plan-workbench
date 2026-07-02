import { useLocation, useParams } from "react-router-dom";
import { Helmet } from "react-helmet-async";

// Route → head-tag mapping. Authed workspace routes carry noindex so search
// engines don't waste crawl budget on login-walled pages. Everything is Chinese
// because the UI is Chinese.
type Entry = { title: string; description: string; noindex: boolean };

function match(pathname: string): Entry {
  // Order matters — check most-specific first.
  if (pathname === "/auth") {
    return {
      title: "登录 · StageOS",
      description: "登录 StageOS 学校演出服装排产工作台，管理项目、服装总表、风险倒排与导出。",
      noindex: false,
    };
  }
  if (pathname === "/") {
    return {
      title: "工作台 · StageOS",
      description: "StageOS 工作台首页：查看项目进度、导出记录与验收快照。",
      noindex: true,
    };
  }
  if (pathname === "/projects") {
    return {
      title: "项目列表 · StageOS",
      description: "浏览与检索所有演出服装排产项目，按状态与演出日期筛选。",
      noindex: true,
    };
  }
  if (pathname === "/projects/new" || pathname === "/projects/new/wizard") {
    return {
      title: "新建项目 · StageOS",
      description: "创建新的演出服装排产项目：录入学生名单、预算、演出日期等基础信息。",
      noindex: true,
    };
  }
  if (pathname.startsWith("/projects/") && pathname.endsWith("/edit")) {
    return {
      title: "编辑项目 · StageOS",
      description: "编辑项目基础信息与学生名单，保存后进入服装总表与倒排。",
      noindex: true,
    };
  }
  if (pathname.startsWith("/projects/")) {
    return {
      title: "项目详情 · StageOS",
      description: "查看单个演出项目的服装总表、风险清单、倒排日程与导出记录。",
      noindex: true,
    };
  }
  if (pathname === "/modules") {
    return {
      title: "模块注册表 · StageOS",
      description: "StageOS 模块与路由清单，用于开发验收与模块能力查阅。",
      noindex: true,
    };
  }
  if (pathname === "/exports") {
    return {
      title: "导出中心 · StageOS",
      description: "查看和下载 Markdown / PDF / PNG 导出记录，支持一键重导与云端存档。",
      noindex: true,
    };
  }
  if (pathname === "/settings") {
    return {
      title: "设置 · StageOS",
      description: "StageOS 全局设置：采购模式、Webhook、验收面板与账户操作。",
      noindex: true,
    };
  }
  return {
    title: "页面未找到 · StageOS",
    description: "该路径不存在，请返回工作台或项目列表。",
    noindex: true,
  };
}

export function RouteHead() {
  const { pathname } = useLocation();
  useParams(); // no-op; kept for future param-driven titles
  const entry = match(pathname);
  const path = pathname || "/";
  return (
    <Helmet>
      <title>{entry.title}</title>
      <meta name="description" content={entry.description} />
      <link rel="canonical" href={path} />
      <meta property="og:title" content={entry.title} />
      <meta property="og:description" content={entry.description} />
      <meta property="og:url" content={path} />
      <meta property="og:type" content="website" />
      <meta name="twitter:card" content="summary" />
      <meta name="twitter:title" content={entry.title} />
      <meta name="twitter:description" content={entry.description} />
      {entry.noindex && <meta name="robots" content="noindex,nofollow" />}
    </Helmet>
  );
}
