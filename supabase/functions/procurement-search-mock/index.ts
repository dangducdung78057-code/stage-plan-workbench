// StageOS · procurement-search-mock (v3.2 · 只读联调)
// 只读候选商品 mock endpoint。不接真实电商 API，不下单，不承诺库存。
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";

type PlanItem = { category?: string; description?: string };
type MatchContext = {
  programType?: string;
  schoolStage?: string;
  perPersonBudget?: number;
};

type Candidate = {
  platform: "taobao" | "1688" | "jd" | "pdd";
  title: string;
  keyword: string;
  estimatedPrice: number;
  matchReason: string;
  riskNote: string;
  url?: string;
  provider: "http-mock";
  matchScore: number;
  sourceNote: string;
};

function buildCandidates(item: PlanItem, ctx: MatchContext): Candidate[] {
  const cat = (item?.category ?? "上装").toString();
  const desc = (item?.description ?? "校园演出服装").toString();
  const stage = (ctx?.schoolStage ?? "primary").toString();
  const program = (ctx?.programType ?? "chorus").toString();
  const kw = `${stage} ${program} ${cat} ${desc}`.trim();

  const priceBase = Math.max(30, Math.min(400, Math.round(ctx?.perPersonBudget ? ctx.perPersonBudget * 0.35 : 80)));
  const risk = "非实时库存/价格，需人工核验；建议先小批量验样再批量下单。";
  const src = "StageOS mock endpoint · 只读联调，不代表真实商品";

  return [
    {
      platform: "taobao",
      title: `[样例] ${cat} · ${desc} · 学生演出款`,
      keyword: kw + " 学生演出",
      estimatedPrice: priceBase,
      matchReason: `匹配类目「${cat}」与描述「${desc}」`,
      riskNote: risk,
      url: `https://s.taobao.com/search?q=${encodeURIComponent(kw)}`,
      provider: "http-mock",
      matchScore: 0.92,
      sourceNote: src,
    },
    {
      platform: "1688",
      title: `[样例] ${cat} · ${desc} · 校服工厂现货`,
      keyword: kw + " 批发",
      estimatedPrice: Math.round(priceBase * 0.75),
      matchReason: `批发渠道，适合 ${program} 集体采购`,
      riskNote: risk,
      url: `https://s.1688.com/selloffer/offer_search.htm?keywords=${encodeURIComponent(kw)}`,
      provider: "http-mock",
      matchScore: 0.86,
      sourceNote: src,
    },
    {
      platform: "jd",
      title: `[样例] ${cat} · ${desc} · 京东自营`,
      keyword: kw + " 自营",
      estimatedPrice: Math.round(priceBase * 1.2),
      matchReason: `自营快速到货，${stage} 演出兜底备选`,
      riskNote: risk,
      url: `https://search.jd.com/Search?keyword=${encodeURIComponent(kw)}`,
      provider: "http-mock",
      matchScore: 0.78,
      sourceNote: src,
    },
  ];
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const jsonHeaders = { ...corsHeaders, "Content-Type": "application/json; charset=utf-8" };

  // Healthcheck: GET or body.healthcheck === true
  if (req.method === "GET") {
    return new Response(
      JSON.stringify({ ok: true, providerId: "http-mock", healthcheck: true, candidates: [] }),
      { headers: jsonHeaders },
    );
  }

  let body: any = {};
  try {
    body = await req.json();
  } catch {
    return new Response(
      JSON.stringify({ ok: false, code: "BAD_REQUEST", providerId: "http-mock", candidates: [] }),
      { status: 400, headers: jsonHeaders },
    );
  }

  if (body?.healthcheck === true) {
    return new Response(
      JSON.stringify({ ok: true, providerId: "http-mock", healthcheck: true, candidates: [] }),
      { headers: jsonHeaders },
    );
  }

  const item: PlanItem = body?.item ?? {};
  const ctx: MatchContext = body?.ctx ?? {};
  const candidates = buildCandidates(item, ctx).slice(0, 3);

  return new Response(
    JSON.stringify({ ok: true, providerId: "http-mock", candidates }),
    { headers: jsonHeaders },
  );
});
