// StageOS · 采购候选商品 v1 · 本地模拟商品目录
// 所有数据均为模拟/检索建议，非实时库存价格，不构成采购承诺。

export type CandidatePlatform = "taobao" | "1688" | "pinduoduo" | "jd" | "douyin";

export type Candidate = {
  platform: CandidatePlatform;
  title: string;
  keyword: string;
  estimatedPrice: number;
  matchReason: string;
  riskNote: string;
  url?: string;
};

export type CatalogEntry = {
  categoryTags: string[];
  programTypes?: string[];
  schoolStages?: string[];
  candidates: Candidate[];
};

export const PLATFORM_LABELS: Record<CandidatePlatform, string> = {
  taobao: "淘宝",
  "1688": "1688",
  pinduoduo: "拼多多",
  jd: "京东",
  douyin: "抖音",
};

function search(platform: CandidatePlatform, kw: string): string {
  const q = encodeURIComponent(kw);
  switch (platform) {
    case "taobao": return `https://s.taobao.com/search?q=${q}`;
    case "1688": return `https://s.1688.com/selloffer/offer_search.htm?keywords=${q}`;
    case "pinduoduo": return `https://mobile.yangkeduo.com/search_result.html?search_key=${q}`;
    case "jd": return `https://search.jd.com/Search?keyword=${q}`;
    case "douyin": return `https://www.douyin.com/search/${q}`;
  }
}

export const PROCUREMENT_CATALOG: CatalogEntry[] = [
  {
    categoryTags: ["白衬衫", "衬衫", "衬衣", "white shirt"],
    candidates: [
      { platform: "1688", title: "校园演出白色长袖衬衫 修身版", keyword: "学生演出白衬衫 长袖", estimatedPrice: 32, matchReason: "1688 批量价，适合合唱/朗诵集体队形", riskNote: "码数偏小，建议按实测胸围加一码", url: search("1688", "学生演出白衬衫 长袖") },
      { platform: "taobao", title: "合唱团白衬衫 男女同款", keyword: "合唱团 白衬衫", estimatedPrice: 55, matchReason: "现货款，颜色一致性较高", riskNote: "同一店铺不同批次可能存在色差", url: search("taobao", "合唱团 白衬衫") },
      { platform: "pinduoduo", title: "学生表演白衬衫 免烫", keyword: "学生 白衬衫 免烫", estimatedPrice: 28, matchReason: "预算敏感型备选", riskNote: "面料偏薄，舞台灯下可能透光", url: search("pinduoduo", "学生 白衬衫 免烫") },
    ],
  },
  {
    categoryTags: ["黑西裤", "西裤", "西装裤", "长裤"],
    candidates: [
      { platform: "1688", title: "学生黑色西裤 直筒", keyword: "学生 黑色西裤 直筒", estimatedPrice: 45, matchReason: "合唱/主持标配下装", riskNote: "长度偏长，需提前统计裤长档", url: search("1688", "学生 黑色西裤 直筒") },
      { platform: "taobao", title: "青少年演出黑西裤", keyword: "青少年 演出 黑西裤", estimatedPrice: 68, matchReason: "小/初/高全学段覆盖", riskNote: "腰围弹性一般，建议核对腰围表", url: search("taobao", "青少年 演出 黑西裤") },
    ],
  },
  {
    categoryTags: ["演出连衣裙", "连衣裙", "长裙", "礼服裙"],
    programTypes: ["chorus", "mixed_chorus", "classical_dance", "new_year_gala"],
    candidates: [
      { platform: "taobao", title: "合唱团女生连衣裙 及膝款", keyword: "合唱 女生 连衣裙", estimatedPrice: 128, matchReason: "合唱/新年晚会常规款", riskNote: "面料反光，需与舞台灯光配色", url: search("taobao", "合唱 女生 连衣裙") },
      { platform: "1688", title: "学生演出礼服裙 批发", keyword: "学生 演出 礼服裙 批发", estimatedPrice: 95, matchReason: "20 件以上批量下单更优", riskNote: "同批次颜色以实物为准", url: search("1688", "学生 演出 礼服裙 批发") },
    ],
  },
  {
    categoryTags: ["民族舞", "古典舞", "汉服", "民族服装"],
    programTypes: ["folk_dance", "classical_dance"],
    candidates: [
      { platform: "taobao", title: "少儿古典舞演出服 飘逸款", keyword: "少儿 古典舞 演出服", estimatedPrice: 168, matchReason: "适配古典舞袖型与身段", riskNote: "配饰（腰带/头饰）需单独采购", url: search("taobao", "少儿 古典舞 演出服") },
      { platform: "1688", title: "民族舞蹈服 团购装", keyword: "民族舞蹈服 团购", estimatedPrice: 138, matchReason: "民族/合唱通用款", riskNote: "袖长可能过长，需提前修改", url: search("1688", "民族舞蹈服 团购") },
      { platform: "douyin", title: "校园民族风演出套装", keyword: "校园 民族风 演出服", estimatedPrice: 155, matchReason: "直播款视觉效果好", riskNote: "无固定库存，需询单发货周期", url: search("douyin", "校园 民族风 演出服") },
    ],
  },
  {
    categoryTags: ["爵士", "现代舞", "街舞", "jazz"],
    programTypes: ["modern_jazz_street"],
    candidates: [
      { platform: "taobao", title: "少儿爵士舞演出服 亮片", keyword: "少儿 爵士舞 亮片 演出服", estimatedPrice: 118, matchReason: "现代/爵士风格常用", riskNote: "亮片易脱落，彩排前需检查", url: search("taobao", "少儿 爵士舞 亮片 演出服") },
      { platform: "1688", title: "街舞 hip-hop 团体服", keyword: "街舞 团体服 hiphop", estimatedPrice: 89, matchReason: "尺码齐全，性价比高", riskNote: "版型偏欧美，小学生需选 XS", url: search("1688", "街舞 团体服 hiphop") },
    ],
  },
  {
    categoryTags: ["啦啦操", "啦啦队", "cheer"],
    programTypes: ["cheerleading"],
    candidates: [
      { platform: "taobao", title: "啦啦操比赛服 定制", keyword: "啦啦操 比赛服 定制", estimatedPrice: 198, matchReason: "支持队名/校徽定制", riskNote: "定制周期 15-25 天，需提前排期", url: search("taobao", "啦啦操 比赛服 定制") },
      { platform: "1688", title: "校园啦啦队演出服 套装", keyword: "校园 啦啦队 演出服", estimatedPrice: 128, matchReason: "含上衣+短裙+发饰", riskNote: "短裙长度偏短，需家长确认", url: search("1688", "校园 啦啦队 演出服") },
    ],
  },
  {
    categoryTags: ["运动服", "班服", "运动会", "校服"],
    programTypes: ["sports_opening_ceremony", "class_showcase"],
    candidates: [
      { platform: "1688", title: "运动会开幕式 班服团购", keyword: "运动会 班服 团购", estimatedPrice: 39, matchReason: "40 人起批更优惠", riskNote: "印制 LOGO 需额外 5-7 天", url: search("1688", "运动会 班服 团购") },
      { platform: "pinduoduo", title: "学生运动服 速干套装", keyword: "学生 运动服 速干", estimatedPrice: 45, matchReason: "预算友好，尺码齐全", riskNote: "颜色可能与图片有色差", url: search("pinduoduo", "学生 运动服 速干") },
    ],
  },
  {
    categoryTags: ["芭蕾", "ballet", "tutu"],
    programTypes: ["ballet"],
    candidates: [
      { platform: "taobao", title: "儿童芭蕾舞演出服 tutu 裙", keyword: "儿童 芭蕾 tutu", estimatedPrice: 148, matchReason: "芭蕾专用剪裁", riskNote: "需搭配肉色连袜专门采购", url: search("taobao", "儿童 芭蕾 tutu") },
    ],
  },
  {
    categoryTags: ["白手套", "手套", "礼仪手套"],
    candidates: [
      { platform: "pinduoduo", title: "礼仪白手套 弹力款 10 双装", keyword: "礼仪 白手套 10双", estimatedPrice: 15, matchReason: "配饰常规款，价格稳定", riskNote: "薄款易破，建议多备 20%", url: search("pinduoduo", "礼仪 白手套 10双") },
      { platform: "1688", title: "演出白手套 批发", keyword: "演出 白手套 批发", estimatedPrice: 8, matchReason: "50 双起批极致低价", riskNote: "非独立包装，需分发时清点", url: search("1688", "演出 白手套 批发") },
    ],
  },
  {
    categoryTags: ["领结", "领带", "蝴蝶结"],
    candidates: [
      { platform: "taobao", title: "学生演出领结 松紧带款", keyword: "学生 演出 领结 松紧", estimatedPrice: 6, matchReason: "松紧带更便于低年级学生穿戴", riskNote: "颜色深浅有细微差异", url: search("taobao", "学生 演出 领结 松紧") },
    ],
  },
  {
    categoryTags: ["发饰", "头饰", "发夹", "皇冠"],
    candidates: [
      { platform: "taobao", title: "演出头饰 女童 珍珠款", keyword: "演出 头饰 女童 珍珠", estimatedPrice: 12, matchReason: "合唱/古典舞常用", riskNote: "夹力弱，跳跃动作易脱落", url: search("taobao", "演出 头饰 女童 珍珠") },
      { platform: "pinduoduo", title: "儿童表演发夹 套装", keyword: "儿童 表演 发夹 套装", estimatedPrice: 9, matchReason: "多款混装，方便造型搭配", riskNote: "工艺参差，需人工挑拣", url: search("pinduoduo", "儿童 表演 发夹 套装") },
    ],
  },
  {
    categoryTags: ["腰带", "腰封"],
    candidates: [
      { platform: "1688", title: "演出腰封 缎面 儿童款", keyword: "演出 腰封 缎面 儿童", estimatedPrice: 18, matchReason: "多色可选，配裙装", riskNote: "缎面易褶皱，运输需平放", url: search("1688", "演出 腰封 缎面 儿童") },
    ],
  },
  {
    categoryTags: ["演出鞋", "舞蹈鞋", "皮鞋"],
    candidates: [
      { platform: "taobao", title: "学生演出皮鞋 男女同款", keyword: "学生 演出 皮鞋 同款", estimatedPrice: 79, matchReason: "合唱/主持标配", riskNote: "鞋底偏硬，需提前适应", url: search("taobao", "学生 演出 皮鞋 同款") },
      { platform: "1688", title: "舞蹈鞋 软底 儿童", keyword: "舞蹈鞋 软底 儿童", estimatedPrice: 42, matchReason: "古典舞/民族舞通用", riskNote: "偏码，建议按实测脚长选码", url: search("1688", "舞蹈鞋 软底 儿童") },
    ],
  },
  {
    categoryTags: ["旗袍", "唐装", "中式"],
    programTypes: ["recitation", "classical_dance", "reunion_gala"],
    candidates: [
      { platform: "taobao", title: "儿童旗袍 朗诵演出", keyword: "儿童 旗袍 朗诵", estimatedPrice: 158, matchReason: "朗诵/合唱国风节目", riskNote: "面料涤纶偏硬，需熨烫", url: search("taobao", "儿童 旗袍 朗诵") },
    ],
  },
  {
    categoryTags: ["西装", "小西服", "礼仪服"],
    programTypes: ["host", "etiquette_award", "reunion_gala"],
    candidates: [
      { platform: "taobao", title: "儿童主持人西装套装", keyword: "儿童 主持人 西装", estimatedPrice: 189, matchReason: "含西服+衬衫+领结", riskNote: "袖长偏长，需现场修改", url: search("taobao", "儿童 主持人 西装") },
      { platform: "1688", title: "小学生主持西服 团体", keyword: "小学生 主持 西服 团体", estimatedPrice: 128, matchReason: "10 套起团更优", riskNote: "颜色黑蓝需下单前确认", url: search("1688", "小学生 主持 西服 团体") },
    ],
  },
];
