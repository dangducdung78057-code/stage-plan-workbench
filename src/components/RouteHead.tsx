import { useLocation, useParams } from "react-router-dom";
import { Helmet } from "react-helmet-async";

// Route → head-tag mapping. Authed workspace routes carry noindex so search
// engines don't waste crawl budget on login-walled pages. Everything is Chinese
// because the UI is Chinese.
type Entry = { title: string; description: string; noindex: boolean };

const BASE_URL = "https://stageos-costume-craft.lovable.app";

function shortId(id: string | undefined) {
  if (!id) return "";
  return id.length > 8 ? id.slice(0, 8) : id;
}

function match(pathname: string, params: Record<string, string | undefined>): Entry {
  // Order matters — check most-specific first.
  if (pathname === "/auth") {
    return {
      title: "登录 · StageOS 演出服装排产工作台",
      description:
        "登录 StageOS 学校演出服装排产工作台，管理项目、服装总表、风险倒排与多格式导出，端到端跟踪演出制作。",
      noindex: false,
    };
  }
  if (pathname === "/") {
    return {
      title: "工作台首页 · StageOS",
      description:
        "StageOS 工作台首页：项目进度、验收状态、导出记录一目了然，快速新建演出服装排产项目并跳转至详情。",
      noindex: true,
    };
  }
  if (pathname === "/projects") {
    return {
      title: "项目列表 · StageOS",
      description:
        "浏览与检索全部演出服装排产项目，按状态、演出日期、学段与人数筛选，快速进入项目详情或继续编辑。",
      noindex: true,
    };
  }
  if (pathname === "/projects/new/wizard") {
    return {
      title: "新建项目 · 向导模式 · StageOS",
      description:
        "以分步向导新建演出服装排产项目：学段、节目类型、名单、演出日期与预算逐步录入，减少字段遗漏。",
      noindex: true,
    };
  }
  if (pathname === "/projects/new") {
    return {
      title: "新建项目 · 经典表单 · StageOS",
      description:
        "使用经典表单一次性创建演出服装排产项目，快速录入基础信息、名单、预算与演出日期。",
      noindex: true,
    };
  }
  if (pathname.startsWith("/projects/") && pathname.endsWith("/edit")) {
    const id = shortId(params.id);
    return {
      title: id ? `编辑项目 ${id} · StageOS` : "编辑项目 · StageOS",
      description:
        "编辑演出服装排产项目的基础信息与学生名单，保存后进入服装总表、倒排日程与用户确认环节。",
      noindex: true,
    };
  }
  if (pathname.startsWith("/projects/")) {
    const id = shortId(params.id);
    return {
      title: id ? `项目 ${id} 详情 · StageOS` : "项目详情 · StageOS",
      description:
        "查看单个演出项目的服装总表、风险清单、倒排日程、用户确认与导出记录，端到端追踪制作进度。",
      noindex: true,
    };
  }
  if (pathname === "/modules") {
    return {
      title: "模块注册表 · StageOS",
      description:
        "StageOS 模块与路由清单，用于开发验收与模块能力查阅，掌握各能力层（L0/L1/L2）的当前状态。",
      noindex: true,
    };
  }
  if (pathname === "/exports") {
    return {
      title: "导出中心 · StageOS",
      description:
        "查看与下载 Markdown / PDF / PNG 导出记录，支持一键重导与云端存档，随时回溯历史版本。",
      noindex: true,
    };
  }
  if (pathname === "/settings") {
    return {
      title: "全局设置 · StageOS",
      description:
        "StageOS 全局设置：采购模式、Webhook 出站配置、验收面板策略与账户操作，一处管理运营参数。",
      noindex: true,
    };
  }
  return {
    title: "页面未找到 · StageOS",
    description: "该路径不存在或已被移除，请返回工作台或项目列表继续操作。",
    noindex: true,
  };
}

export function RouteHead() {
  const { pathname } = useLocation();
  const params = useParams();
  const entry = match(pathname, params);
  const path = pathname || "/";
  const absolute = `${BASE_URL}${path}`;
  return (
    <Helmet>
      <title>{entry.title}</title>
      <meta name="description" content={entry.description} />
      <link rel="canonical" href={absolute} />
      <meta property="og:title" content={entry.title} />
      <meta property="og:description" content={entry.description} />
      <meta property="og:url" content={absolute} />
      <meta property="og:type" content="website" />
      <meta name="twitter:card" content="summary" />
      <meta name="twitter:title" content={entry.title} />
      <meta name="twitter:description" content={entry.description} />
      {entry.noindex && <meta name="robots" content="noindex,nofollow" />}
    </Helmet>
  );
}
