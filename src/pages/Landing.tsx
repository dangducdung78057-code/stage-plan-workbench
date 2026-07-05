import { motion } from "framer-motion";
import { Link } from "react-router-dom";
import { ArrowUpRight, Play } from "lucide-react";
import { FadingVideo } from "@/components/landing/FadingVideo";
import { BlurText } from "@/components/landing/BlurText";

const HERO_VIDEO =
  "https://d8j0ntlcm91z4.cloudfront.net/user_38xzZboKViGWJOttwIXH07lWA1P/hf_20260418_080021_d598092b-c4c2-4e53-8e46-94cf9064cd50.mp4";
const CAPABILITIES_VIDEO =
  "https://d8j0ntlcm91z4.cloudfront.net/user_38xzZboKViGWJOttwIXH07lWA1P/hf_20260418_094631_d30ab262-45ee-4b7d-99f3-5d5848c8ef13.mp4";

const fadeUp = {
  initial: { filter: "blur(10px)", opacity: 0, y: 20 },
  animate: { filter: "blur(0px)", opacity: 1, y: 0 },
};

const NAV_LINKS = [
  { label: "首页", href: "#top" },
  { label: "功能", href: "#capabilities" },
  { label: "模块", href: "/modules" },
  { label: "导出", href: "/exports" },
  { label: "开始排产", href: "/auth" },
];

const CARDS = [
  {
    title: "AI 服装总表",
    body: "录入节目与人数，AI 自动生成分角色、分尺码的服装总表——从领舞到群演，一张表看清全部制作需求。",
    tags: ["角色拆分", "尺码矩阵", "面料建议", "一键生成"],
    icon: (
      <path d="M5 21q-.825 0-1.412-.587T3 19V5q0-.825.588-1.412T5 3h14q.825 0 1.413.588T21 5v14q0 .825-.587 1.413T19 21H5Zm1-4h12l-3.75-5-3 4L9 13l-3 4Z" />
    ),
  },
  {
    title: "批量排产",
    body: "整场演出的服装制作在几分钟内完成倒排。工期、风险、关键节点自动计算，无需数周的人工排期。",
    tags: ["倒排计划", "风险预警", "冻结窗口", "多项目并行"],
    icon: (
      <path d="M4 6.47 5.76 10H20v8H4V6.47M22 4h-4l2 4h-3l-2-4h-2l2 4h-3l-2-4H8l2 4H7L5 4H4c-1.1 0-1.99.89-1.99 2L2 18c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V4Z" />
    ),
  },
  {
    title: "导出与追溯",
    body: "方案快照、确认记录、导出文件全程落库。Markdown、PDF、PNG 多格式导出，每一版都可回溯。",
    tags: ["方案快照", "多格式导出", "确认留痕", "版本对比"],
    icon: (
      <path d="M9 21c0 .55.45 1 1 1h4c.55 0 1-.45 1-1v-1H9v1Zm3-19C8.14 2 5 5.14 5 9c0 2.38 1.19 4.47 3 5.74V17c0 .55.45 1 1 1h6c.55 0 1-.45 1-1v-2.26c1.81-1.27 3-3.36 3-5.74 0-3.86-3.14-7-7-7Z" />
    ),
  },
];

function Navbar() {
  return (
    <header className="fixed top-4 left-0 right-0 z-50 px-8 lg:px-16">
      <div className="flex items-center justify-between">
        <Link
          to="/"
          className="liquid-glass flex h-12 w-12 items-center justify-center rounded-full font-heading italic text-2xl text-white"
          aria-label="StageOS 首页"
        >
          s
        </Link>
        <nav className="liquid-glass hidden items-center rounded-full px-1.5 py-1.5 md:flex" aria-label="主导航">
          {NAV_LINKS.map((link) =>
            link.href.startsWith("#") ? (
              <a
                key={link.label}
                href={link.href}
                className="px-3 py-2 text-sm font-medium text-white/90 font-body"
              >
                {link.label}
              </a>
            ) : (
              <Link
                key={link.label}
                to={link.href}
                className="px-3 py-2 text-sm font-medium text-white/90 font-body"
              >
                {link.label}
              </Link>
            ),
          )}
          <Link
            to="/workspace"
            className="ml-1.5 flex items-center gap-1 whitespace-nowrap rounded-full bg-white px-4 py-2 text-sm font-medium text-black"
          >
            进入工作台
            <ArrowUpRight className="h-4 w-4" aria-hidden="true" />
          </Link>
        </nav>
        <div className="h-12 w-12" aria-hidden="true" />
      </div>
    </header>
  );
}

function Hero() {
  return (
    <section id="top" className="relative flex min-h-screen flex-col overflow-hidden bg-black">
      <FadingVideo
        src={HERO_VIDEO}
        className="absolute left-1/2 top-0 z-0 -translate-x-1/2 object-cover object-top"
        style={{ width: "120%", height: "120%" }}
      />
      <div className="relative z-10 flex flex-1 flex-col">
        <div className="flex flex-1 flex-col items-center justify-center px-4 pt-24 text-center">
          <motion.div
            {...fadeUp}
            transition={{ duration: 0.7, ease: "easeOut", delay: 0.4 }}
            className="liquid-glass flex items-center gap-3 rounded-full py-1 pl-1 pr-3"
          >
            <span className="rounded-full bg-white px-3 py-1 text-xs font-semibold text-black">新</span>
            <span className="text-sm text-white/90 font-body">AI 服装总表生成已上线</span>
          </motion.div>

          <BlurText
            text="让每一场演出 从容开场"
            className="mt-6 max-w-2xl font-heading italic text-6xl leading-[0.9] tracking-[-2px] text-white md:text-7xl lg:text-[5.5rem]"
          />

          <motion.p
            {...fadeUp}
            transition={{ duration: 0.7, ease: "easeOut", delay: 0.8 }}
            className="mt-4 max-w-2xl text-sm font-light leading-tight text-white font-body md:text-base"
          >
            StageOS 把演出服装排产变成一条清晰的流水线——项目录入、AI
            总表、风险倒排、用户确认、多格式导出，一站式完成，全程可追溯。
          </motion.p>

          <motion.div
            {...fadeUp}
            transition={{ duration: 0.7, ease: "easeOut", delay: 1.1 }}
            className="mt-6 flex items-center gap-6"
          >
            <Link
              to="/auth"
              className="liquid-glass-strong flex items-center gap-1.5 rounded-full px-5 py-2.5 text-sm font-medium text-white"
            >
              开始排产
              <ArrowUpRight className="h-5 w-5" aria-hidden="true" />
            </Link>
            <a href="#capabilities" className="flex items-center gap-2 text-sm font-medium text-white font-body">
              查看功能
              <Play className="h-4 w-4 fill-current" aria-hidden="true" />
            </a>
          </motion.div>

          <motion.div
            {...fadeUp}
            transition={{ duration: 0.7, ease: "easeOut", delay: 1.3 }}
            className="mt-8 flex items-stretch gap-4"
          >
            <div className="liquid-glass flex w-[220px] flex-col justify-between rounded-[1.25rem] p-5 text-left">
              <svg
                className="h-7 w-7 text-white"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.5"
                aria-hidden="true"
              >
                <circle cx="12" cy="12" r="9" />
                <path d="M12 7v5l3 3" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              <div className="mt-6">
                <div className="font-heading italic text-4xl leading-none tracking-[-1px] text-white">10 分钟</div>
                <div className="mt-2 text-xs font-light text-white font-body">从项目录入到方案快照</div>
              </div>
            </div>
            <div className="liquid-glass flex w-[220px] flex-col justify-between rounded-[1.25rem] p-5 text-left">
              <svg
                className="h-7 w-7 text-white"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.5"
                aria-hidden="true"
              >
                <circle cx="12" cy="12" r="9" />
                <path d="M3 12h18M12 3a15 15 0 0 1 0 18M12 3a15 15 0 0 0 0 18" strokeLinecap="round" />
              </svg>
              <div className="mt-6">
                <div className="font-heading italic text-4xl leading-none tracking-[-1px] text-white">100%</div>
                <div className="mt-2 text-xs font-light text-white font-body">导出与确认记录可追溯</div>
              </div>
            </div>
          </motion.div>
        </div>

        <motion.div
          {...fadeUp}
          transition={{ duration: 0.7, ease: "easeOut", delay: 1.4 }}
          className="flex flex-col items-center gap-4 pb-8"
        >
          <div className="liquid-glass rounded-full px-3.5 py-1 text-xs font-medium text-white">
            服务于学校、剧团与演出制作团队
          </div>
          <div className="flex items-center gap-12 font-heading italic text-2xl tracking-tight text-white md:gap-16 md:text-3xl">
            <span>校庆晚会</span>
            <span>艺术节</span>
            <span>话剧社</span>
            <span>舞蹈团</span>
            <span>合唱节</span>
          </div>
        </motion.div>
      </div>
    </section>
  );
}

function Capabilities() {
  return (
    <section id="capabilities" className="relative min-h-screen overflow-hidden bg-black">
      <FadingVideo src={CAPABILITIES_VIDEO} className="absolute inset-0 z-0 h-full w-full object-cover" />
      <div className="relative z-10 flex min-h-screen flex-col px-8 pt-24 pb-10 md:px-16 lg:px-20">
        <div className="mb-auto">
          <motion.p
            {...fadeUp}
            transition={{ duration: 0.7, ease: "easeOut", delay: 0.2 }}
            className="mb-6 text-sm text-white/80 font-body"
          >
            {"// 核心能力"}
          </motion.p>
          <h2 className="font-heading italic text-6xl leading-[0.95] tracking-[-2px] text-white md:text-7xl lg:text-[6rem]">
            <BlurText text="排产，" justify="flex-start" />
            <BlurText text="进化了" justify="flex-start" />
          </h2>
        </div>

        <div className="mt-16 grid grid-cols-1 gap-6 md:grid-cols-3">
          {CARDS.map((card, i) => (
            <motion.article
              key={card.title}
              initial={{ filter: "blur(10px)", opacity: 0, y: 20 }}
              whileInView={{ filter: "blur(0px)", opacity: 1, y: 0 }}
              viewport={{ once: true, amount: 0.2 }}
              transition={{ duration: 0.7, ease: "easeOut", delay: 0.2 + i * 0.15 }}
              className="liquid-glass flex min-h-[360px] flex-col rounded-[1.25rem] p-6"
            >
              <div className="flex items-start justify-between gap-4">
                <div className="liquid-glass flex h-11 w-11 shrink-0 items-center justify-center rounded-[0.75rem]">
                  <svg className="h-6 w-6 text-white" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                    {card.icon}
                  </svg>
                </div>
                <div className="flex max-w-[70%] flex-wrap justify-end gap-1.5">
                  {card.tags.map((tag) => (
                    <span
                      key={tag}
                      className="liquid-glass whitespace-nowrap rounded-full px-3 py-1 text-[11px] text-white/90 font-body"
                    >
                      {tag}
                    </span>
                  ))}
                </div>
              </div>
              <div className="flex-1" />
              <div className="mt-6">
                <h3 className="font-heading italic text-3xl leading-none tracking-[-1px] text-white md:text-4xl">
                  {card.title}
                </h3>
                <p className="mt-3 max-w-[32ch] text-sm font-light leading-snug text-white/90 font-body">
                  {card.body}
                </p>
              </div>
            </motion.article>
          ))}
        </div>
      </div>
    </section>
  );
}

export default function Landing() {
  return (
    <main className="bg-black font-body">
      <Navbar />
      <Hero />
      <Capabilities />
    </main>
  );
}
