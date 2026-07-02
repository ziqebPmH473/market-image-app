// Market Image Generator (single template, client-side only)
//
// Input format: TSV blocks separated by [SECTION] lines.
// - [MARKET] expects key\tvalue table
// - list sections expect header row, then rows
//
// Sections used:
// [MARKET], [RISERS], [DECLINERS], [SECTOR_TOP], [SECTOR_WORST]

const formatSample = `[MARKET]
key\tvalue
title\t1分でわかる！今日の株式市場
date\t2026/03/04
timing\t前引け
headline\t日経平均・TOPIXともに大幅続落
nikkei_value\t54090.11
nikkei_diff\t-2188.94
nikkei_pct\t-3.89
topix_value\t3611.96
topix_diff\t-160.21
topix_pct\t-4.25
risers_title\t値上がり率TOP5: 逆行高を演じる注目銘柄
decliners_title\t値下がり率TOP5: 資源・重工業株を中心に激しい売り
sector_title\t業種別騰落率（トップ＆ワースト5）：非鉄金属・石油が7%超の暴落

[RISERS]
rank\tname\tpct\tprice\tdiff
1\tTOKYO BASE\t+7.42\t391\t+27
2\tベイカレント\t+6.34\t4529\t+270
3\tニデック\t+6.00\t2402\t+136
4\tギフティ\t+4.74\t995\t+45
5\tメドレー\t+4.32\t1859\t+77

[DECLINERS]
rank\tname\tpct\tprice\tdiff
1\t日鉄鉱業\t-14.82\t3420\t-595
2\tオプトラン\t-13.19\t2752\t-418
3\t大阪チタニウムテクノロジーズ\t-12.92\t2852\t-423
4\t正興電機製作所\t-12.41\t2231\t-316
5\t三井E&S\t-12.28\t6829\t-956

[SECTOR_TOP]
rank\tsector\tpct\tper
1\tその他製品\t-0.71\t18.5
2\tサービス業\t-0.94\t25.1
3\t小売業\t-1.02\t22.8
4\t空運業\t-1.82\t19.4
5\t陸運業\t-2.13\t20.7

[SECTOR_WORST]
rank\tsector\tpct\tper
1\t非鉄金属\t-7.85\t12.3
2\t石油・石炭\t-7.41\t9.8
3\tガラス・土石\t-6.49\t15.6
4\t卸売業\t-6.39\t16.2
5\t銀行業\t-6.31\t14.7
`;

const $ = (id) => document.getElementById(id);

function normalizeNewlines(s){ return (s || "").replace(/\r\n/g, "\n").replace(/\r/g, "\n"); }

function parseTSVBlocks(text){
  text = normalizeNewlines(text).trim();
  const lines = text.split("\n").map(l => l.trimEnd());
  const sections = {};
  let current = null;
  for(const raw of lines){
    const line = raw.trim();
    if(!line) continue;
    const m = line.match(/^\[(.+?)\]$/);
    if(m){
      current = m[1].trim().toUpperCase();
      if(!sections[current]) sections[current] = [];
      continue;
    }
    if(!current){
      // Ignore anything before first [SECTION]
      continue;
    }
    sections[current].push(raw);
  }

  const out = {};
  for(const [sec, secLines] of Object.entries(sections)){
    if(secLines.length === 0) continue;
    // Expect header line as TSV
    const header = secLines[0].split("\t").map(h => h.trim());
    const rows = secLines.slice(1).map(l => l.split("\t"));
    if(sec === "MARKET"){
      // key/value
      const dict = {};
      for(const r of rows){
        const k = (r[0] ?? "").trim();
        const v = (r[1] ?? "").trim();
        if(k) dict[k] = v;
      }
      out[sec] = dict;
    } else {
      const list = [];
      for(const r of rows){
        const obj = {};
        for(let i=0;i<header.length;i++){
          const k = header[i] || `c${i}`;
          obj[k] = (r[i] ?? "").trim();
        }
        // skip blank rows
        if(Object.values(obj).every(v => !v)) continue;
        list.push(obj);
      }
      out[sec] = list;
    }
  }
  return out;
}

// ----- Formatting helpers -----
function toNumberLoose(v){
  if(v === null || v === undefined) return NaN;
  const s = String(v).replace(/,/g,"").replace(/pt$/i,"").replace(/円$/,"").replace(/%$/,"").trim();
  if(!s) return NaN;
  return Number(s);
}
function fmtComma(n, digits=null){
  if(!isFinite(n)) return "";
  const opts = digits === null ? {} : {minimumFractionDigits:digits, maximumFractionDigits:digits};
  return n.toLocaleString("ja-JP", opts);
}
function fmtSigned(n, digits=null){
  if(!isFinite(n)) return "";
  const sign = n > 0 ? "+" : (n < 0 ? "-" : "");
  const abs = Math.abs(n);
  return sign + fmtComma(abs, digits);
}

function signFromStringLoose(v){
  const s = String(v ?? "").trim();
  if(!s) return 0;
  if(s.startsWith("+")) return 1;
  if(s.startsWith("-")) return -1;
  // Also handle parentheses like ( -1.23% ) or leading unicode minus
  if(/^[−-]/.test(s)) return -1;
  return 0;
}
function colorBySign(ctx, value, red, green, fallback){
  const n = toNumberLoose(value);
  if(isFinite(n) && n !== 0){
    ctx.fillStyle = n > 0 ? red : green;
    return;
  }
  const sgn = signFromStringLoose(value);
  if(sgn !== 0){
    ctx.fillStyle = sgn > 0 ? red : green;
    return;
  }
  ctx.fillStyle = fallback;
}
function pick(dict, keys, fallback=""){
  for(const k of keys){
    if(dict && dict[k] !== undefined && dict[k] !== null && String(dict[k]).trim() !== "") return String(dict[k]).trim();
  }
  return fallback;
}

function ellipsizeToFit(ctx, text, maxW){
  if(ctx.measureText(text).width <= maxW) return text;
  const ell = "…";
  let t = text;
  while(t.length > 1 && ctx.measureText(t + ell).width > maxW){
    t = t.slice(0, -1);
  }
  return t + ell;
}

function drawRoundedRect(ctx, x, y, w, h, r){
  const rr = Math.min(r, w/2, h/2);
  ctx.beginPath();
  ctx.moveTo(x+rr, y);
  ctx.arcTo(x+w, y, x+w, y+h, rr);
  ctx.arcTo(x+w, y+h, x, y+h, rr);
  ctx.arcTo(x, y+h, x, y, rr);
  ctx.arcTo(x, y, x+w, y, rr);
  ctx.closePath();
}

// Fit text by shrinking font size down to minPx, else ellipsize
function drawFitText(ctx, text, x, y, maxW, fontPx, minPx, style, align="left"){
  let size = fontPx;
  ctx.textAlign = align;
  ctx.textBaseline = "alphabetic";
  while(size >= minPx){
    ctx.font = `${style} ${size}px "Noto Sans JP", system-ui, -apple-system, "Segoe UI", "Hiragino Kaku Gothic ProN", "Yu Gothic", sans-serif`;
    const w = ctx.measureText(text).width;
    if(w <= maxW) break;
    size -= 1;
  }
  if(size < minPx){
    ctx.font = `${style} ${minPx}px "Noto Sans JP", system-ui, -apple-system, "Segoe UI", "Hiragino Kaku Gothic ProN", "Yu Gothic", sans-serif`;
    text = ellipsizeToFit(ctx, text, maxW);
  }
  ctx.fillText(text, x, y);
}

function buildModel(parsed){
  const m = parsed.MARKET || {};
  const model = {
    title: pick(m, ["title"], "1分でわかる！今日の株式市場"),
    date: pick(m, ["date"], ""),
    timing: pick(m, ["timing"], ""),
    headline: pick(m, ["headline"], ""),
    nikkei_value: pick(m, ["nikkei_value","n_value","nikkei"], ""),
    nikkei_diff: pick(m, ["nikkei_diff","n_diff"], ""),
    nikkei_pct: pick(m, ["nikkei_pct","n_pct"], ""),
    topix_value: pick(m, ["topix_value","t_value","topix"], ""),
    topix_diff: pick(m, ["topix_diff","t_diff"], ""),
    topix_pct: pick(m, ["topix_pct","t_pct"], ""),
    risers_title: pick(m, ["risers_title"], "値上がり率 TOP5"),
    decliners_title: pick(m, ["decliners_title"], "値下がり率 TOP5"),
    sector_title: pick(m, ["sector_title"], "業種別騰落率（トップ＆ワースト5）"),
    risers: parsed.RISERS || [],
    decliners: parsed.DECLINERS || [],
    sectorTop: parsed.SECTOR_TOP || [],
    sectorWorst: parsed.SECTOR_WORST || []
  };
  return model;
}

function validateModel(model){
  const errs = [];
  const need5 = (arr, label) => {
    if(!Array.isArray(arr) || arr.length < 5) errs.push(`${label} が5行ありません（現在 ${Array.isArray(arr)?arr.length:0} 行）`);
  };
  need5(model.risers, "RISERS");
  need5(model.decliners, "DECLINERS");
  need5(model.sectorTop, "SECTOR_TOP");
  need5(model.sectorWorst, "SECTOR_WORST");
  return errs;
}

// ----- Drawing (single template) -----
function drawCard(ctx, W, H, model){
  const s = W / 1080; // scale
  const M = 18*s;
  const G = 10*s;

  // palette
  const bg = "#f5f2e8";
  const border = "#d7d1c4";
  const boxFill = "#ffffff";
  const text = "#0b0b0b";
  const muted = "#2a2a2a";
  const green = "#0a7a3a";
  const red = "#d82323";

  // background
  ctx.clearRect(0,0,W,H);
  ctx.fillStyle = bg;
  ctx.fillRect(0,0,W,H);

  // Watermark
  ctx.save();
  ctx.globalAlpha = 0.085;
  ctx.translate(W/2, H/2);
  ctx.rotate(-Math.PI/6); // -30deg
  ctx.fillStyle = "#000000";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.font = `${140*s}px "Noto Sans JP", system-ui, sans-serif`;
  ctx.fillText("@sumikko_money", 0, 0);
  ctx.restore();


  // helper to draw framed box
  function box(x,y,w,h,r=14*s){
    ctx.fillStyle = boxFill;
    drawRoundedRect(ctx, x,y,w,h,r);
    ctx.fill();
    ctx.strokeStyle = border;
    ctx.lineWidth = 2*s;
    ctx.stroke();
  }

  // ----- Header -----
  const titleText = model.date && model.timing
    ? `${model.title}（${model.date} ${model.timing}）`
    : (model.date ? `${model.title}（${model.date}）` : model.title);

  ctx.fillStyle = text;
  drawFitText(ctx, titleText, W/2, 74*s, W - 2*M, 50*s, 32*s, "800", "center");

  //if(model.headline){
  //  ctx.fillStyle = text;
  //  drawFitText(ctx, model.headline, M, 98*s, W - 2*M, 24*s, 18*s, "700", "left");
  //}

  // ----- Indices boxes -----
  const idxY = 110*s;
  const idxH = 190*s;
  const idxW = (W - 2*M - G) / 2;

  const leftX = M;
  const rightX = M + idxW + G;

  box(leftX, idxY, idxW, idxH);
  box(rightX, idxY, idxW, idxH);

  function drawIndexBox(x, y, w, h, label, value, diff, pct){
    const pad = 16*s;
    ctx.fillStyle = text;
    drawFitText(ctx, label, x + w/2, y + 42*s, w - 2*pad, 36*s, 28*s, "800", "center");

    const v = toNumberLoose(value);
    const vStr = isFinite(v) ? `${fmtComma(v, 2)}${label==="TOPIX"?"pt":"円"}` : String(value || "");
    // Index value should be black
    ctx.fillStyle = text;
    drawFitText(ctx, vStr, x + w/2, y + 120*s, w - 2*pad, 70*s, 40*s, "900", "center");

    const d = toNumberLoose(diff);
    const p = toNumberLoose(pct);
    const dStr = isFinite(d) ? fmtSigned(d, 2) : String(diff || "");
    const pStr = isFinite(p) ? `(${fmtSigned(p, 2)}%)` : (pct ? `(${pct})` : "");
    ctx.fillStyle = text;
    drawFitText(ctx, "前日比:", x + 65*s, y + h - 24*s, 140*s, 30*s, 18*s, "800", "left");
    colorBySign(ctx, diff, red, green, text);
    drawFitText(ctx, `${dStr} ${pStr}`, x + 184*s, y + h - 24*s, w - 220*s, 30*s, 18*s, "900", "left");
  }

  drawIndexBox(leftX, idxY, idxW, idxH, "日経平均株価", model.nikkei_value, model.nikkei_diff, model.nikkei_pct);
  drawIndexBox(rightX, idxY, idxW, idxH, "TOPIX", model.topix_value, model.topix_diff, model.topix_pct);

  // ----- Risers -----
  const risY = idxY + idxH + 14*s;
  ctx.fillStyle = text;
  drawFitText(ctx, model.risers_title, M, risY + 26*s, W - 2*M, 30*s, 20*s, "900", "left");

  const cardY = risY + 40*s;
  const cardH = 152*s;
  const cardW = (W - 2*M - 4*G)/5;

  function drawMoverCard(x,y,w,h,item,isUp){
    box(x,y,w,h,12*s);
    const pad = 10*s;
    const name = item.name || "";
    const pct = item.pct || "";
    const price = item.price || "";
    const pNum = toNumberLoose(price);
	const priceStr = isFinite(pNum) ? fmtComma(pNum, 0) : String(price || "");
    const diff = item.diff || "";

    // Name: bigger (no rank prefix). Shrink by length, then fit-to-width.
    let baseNamePx = 30*s;
    const len = String(name).length;
    if(len >= 22) baseNamePx = 18*s;
    else if(len >= 18) baseNamePx = 19*s;
    else if(len >= 14) baseNamePx = 21*s;
    else if(len >= 10) baseNamePx = 26*s;
    else baseNamePx = 30*s;

    ctx.fillStyle = text;
    drawFitText(ctx, name, x + w/2, y+38*s, w-2*pad, baseNamePx, 9*s, "900", "center");

    // Percent (largest text in the card)
    const pn = toNumberLoose(pct);
    const pctStr = isFinite(pn) ? `${fmtSigned(pn, 2)}%` : pct;
    colorBySign(ctx, pct, red, green, text);
    drawFitText(ctx, pctStr, x + w/2, y+84*s, w-2*pad, 44*s, 28*s, "900", "center");

    // Stock price centered
    ctx.fillStyle = text;
    drawFitText(ctx, `株価 ${priceStr}円`, x + w/2, y+h-38*s, w-2*pad, 20*s, 18*s, "900", "center");

    // Previous day diff centered, with colored value
    const dn = toNumberLoose(diff);
    const diffStr = isFinite(dn) ? fmtSigned(dn, 0) : diff;

    // Measure to center "前日比 " + diffStr as a whole
    ctx.font = `${900} ${18*s}px "Noto Sans JP", system-ui, -apple-system, "Segoe UI", "Hiragino Kaku Gothic ProN", "Yu Gothic", sans-serif`;
    const labelPart = "前日比 ";
    const wLabel = ctx.measureText(labelPart).width;
    const wValue = ctx.measureText(diffStr).width;
    const startX = x + w/2 - (wLabel + wValue)/2;

    ctx.fillStyle = text;
    ctx.textAlign = "left";
    ctx.textBaseline = "alphabetic";
    ctx.fillText(labelPart, startX, y+h-14*s);

    colorBySign(ctx, diff, red, green, text);
    ctx.fillText(diffStr, startX + wLabel, y+h-14*s);

    // restore
    ctx.textAlign = "left";
  }

  for(let i=0;i<5;i++){
    const it = model.risers[i] || {};
    const x = M + i*(cardW+G);
    drawMoverCard(x, cardY, cardW, cardH, it, true);
  }

  // ----- Decliners -----
  const decTitleY = cardY + cardH + 14*s;
  ctx.fillStyle = text;
  drawFitText(ctx, model.decliners_title, M, decTitleY + 26*s, W - 2*M, 30*s, 20*s, "900", "left");

  const decY = decTitleY + 40*s;
  for(let i=0;i<5;i++){
    const it = model.decliners[i] || {};
    const x = M + i*(cardW+G);
    drawMoverCard(x, decY, cardW, cardH, it, false);
  }

  // ----- Sectors -----
  const secTitleY = decY + cardH + 14*s;
  ctx.fillStyle = text;
  drawFitText(ctx, model.sector_title, M, secTitleY + 26*s, W - 2*M, 30*s, 18*s, "900", "left");

  const topLabelY = secTitleY + 44*s;
  ctx.fillStyle = text;
  drawFitText(ctx, "【トップ5】", M, topLabelY + 18*s, W - 2*M, 24*s, 12*s, "900", "left");

  const secBoxY = topLabelY + 26*s;
  const secH = 116*s;
  const secW = cardW;

  function drawSectorBox(x,y,w,h,item){
    box(x,y,w,h,12*s);
    const pad = 10*s;
    const sector = item.sector || item.name || "";
    const pct = item.pct || "";
    const per = item.per || "";

    // Sector name centered
    ctx.fillStyle = text;
    drawFitText(ctx, sector, x + w/2, y+34*s, w-2*pad, 25*s, 13*s, "900", "center");

    // Percent: biggest in this box (center)
    const pn = toNumberLoose(pct);
    const pctStr = isFinite(pn) ? `${fmtSigned(pn, 2)}%` : pct;
    colorBySign(ctx, pct, red, green, text);
    drawFitText(ctx, pctStr, x + w/2, y+78*s, w-2*pad, 44*s, 24*s, "900", "center");

    // PER centered (black)
    ctx.fillStyle = text;
    drawFitText(ctx, `PER ${per}倍`, x + w/2, y+2+h-14*s, w-2*pad, 20*s, 12*s, "900", "center");
  }

  for(let i=0;i<5;i++){
    const it = model.sectorTop[i] || {};
    const x = M + i*(secW+G);
    drawSectorBox(x, secBoxY, secW, secH, it);
  }

  const worstLabelY = secBoxY + secH + 6*s;
  ctx.fillStyle = text;
  drawFitText(ctx, "【ワースト5】", M, worstLabelY + 18*s, W - 2*M, 24*s, 12*s, "900", "left");

  const worstY = worstLabelY + 22*s;
  for(let i=0;i<5;i++){
    const it = model.sectorWorst[i] || {};
    const x = M + i*(secW+G);
    drawSectorBox(x, worstY, secW, secH, it);
  }
}

function renderFromText(text, options={}){
  const parsed = parseTSVBlocks(text);
  const model = buildModel(parsed);
  const errs = validateModel(model);

  const canvas = $("canvas");
  const ctx = canvas.getContext("2d");

  const hires = !!options.hires;
  const target = hires ? 2048 : 1080;
  if(canvas.width !== target){
    canvas.width = target;
    canvas.height = target;
  }
  drawCard(ctx, target, target, model);

  return {model, errs, parsed};
}

async function downloadPNG(){
  // Always export at 2160 for crispness (2x).
  const tmp = document.createElement("canvas");
  tmp.width = 1080; tmp.height = 1080;
  const ctx = tmp.getContext("2d");

  const parsed = parseTSVBlocks($("input").value);
  const model = buildModel(parsed);
  const errs = validateModel(model);
  if(errs.length){
    setStatus("err", "保存できません: " + errs.join(" / "));
    return;
  }
  drawCard(ctx, 1080, 1080, model);

  const blob = await new Promise(res => tmp.toBlob(res, "image/png"));
  if(!blob){
    setStatus("err", "PNG生成に失敗しました");
    return;
  }

  const filename = (() => {
    const d = (model.date || "").replaceAll("/","");
    const t = model.timing ? (model.timing.includes("前") ? "am" : "pm") : "";
    return `market_${d || "date"}_${t || "snap"}.png`;
  })();

  // Web Share (mobile only)
  const isMobile = /Mobi|Android|iPhone|iPad/i.test(navigator.userAgent);
  const file = new File([blob], filename, {type:"image/png"});
  if(isMobile && navigator.canShare && navigator.canShare({files:[file]})){
    try{
      await navigator.share({files:[file], title: filename});
      setStatus("ok", "共有メニューを開きました");
      return;
    }catch(_){}
  }

  // Fallback: download link
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2500);
  setStatus("ok", "PNGを書き出しました");
}

function setStatus(kind, msg){
  const el = $("status");
  el.classList.remove("ok","err");
  if(kind) el.classList.add(kind);
  el.textContent = msg || "";
}

// ==================== 自動取得（URL→データ取得＋名称正式化） ====================
// stock-slide-generator の仕組みを移植。CFPages Function /api/fetch-sources で
// 野村・日経・株探をサーバー側取得し、証券コード→正式名称（MEIGARA_DICT）に変換。

function autoDictReady(){ return typeof window.MEIGARA_DICT === "object" && window.MEIGARA_DICT; }
function autoLookupName(code){
  const d = autoDictReady();
  if(!d) return null;
  if(d[code] !== undefined) return d[code];
  const up = String(code).toUpperCase();
  return d[up] !== undefined ? d[up] : null;
}
// ホールディングス→ＨＤ 等。順序重要（ＦＧ→ＨＤ→Ｇ）
function autoAbbrevName(name){
  return String(name)
    .replace(/フィナンシャルグループ/g, "ＦＧ")
    .replace(/ホールディングス/g, "ＨＤ")
    .replace(/グループ/g, "Ｇ");
}
// 銘柄名：正式名称（辞書）優先→無ければソース名。最後に略記変換。
function autoResolveName(code, srcName){
  const official = code ? autoLookupName(code) : null;
  return autoAbbrevName(official != null && official !== "" ? official : (srcName || ""));
}
// 符号付き文字列に整える（"-" 始まりはそのまま、それ以外は "+" を付与）
function autoSign(v){
  const s = String(v == null ? "" : v).trim();
  if(!s) return "";
  return /^[−\-]/.test(s) ? s.replace(/^−/, "-") : ("+" + s);
}
function autoStripPct(v){ return String(v == null ? "" : v).replace(/[%％]/g, "").trim(); }
function autoStrip倍(v){ return String(v == null ? "" : v).replace(/[^\d.]/g, ""); }

function autoTodayStr(){
  const d = new Date();
  return `${d.getFullYear()}/${String(d.getMonth()+1).padStart(2,"0")}/${String(d.getDate()).padStart(2,"0")}`;
}

// 取得ソース配列 → key引き
function autoSrcMap(sources){ const m = {}; (sources||[]).forEach(s => { m[s.key] = s; }); return m; }

// 取得データ → Market Image Generator の TSV テキストを組み立てる
function buildAutoTSV(sources, meta){
  const by = autoSrcMap(sources);
  const idx = (by.nomura_index && by.nomura_index.rows) || [];
  const rise = (by.nikkei_rise && by.nikkei_rise.rows) || [];
  const drop = (by.nikkei_drop && by.nikkei_drop.rows) || [];
  const secTop = (by.kabutan_sector_desc && by.kabutan_sector_desc.rows) || [];
  const secWorst = (by.kabutan_sector_asc && by.kabutan_sector_asc.rows) || [];

  const nikkei = idx.find(r => r.name === "日経平均") || {};
  const topix  = idx.find(r => r.name === "TOPIX") || {};

  const lines = [];
  lines.push("[MARKET]");
  lines.push("key\tvalue");
  lines.push(`title\t1分でわかる！今日の株式市場`);
  lines.push(`date\t${meta.date || autoTodayStr()}`);
  lines.push(`timing\t${meta.timing || ""}`);
  lines.push(`nikkei_value\t${(nikkei.value||"").replace(/,/g,"")}`);
  lines.push(`nikkei_diff\t${nikkei.change||""}`);
  lines.push(`nikkei_pct\t${autoStripPct(nikkei.pct)}`);
  lines.push(`topix_value\t${(topix.value||"").replace(/,/g,"")}`);
  lines.push(`topix_diff\t${topix.change||""}`);
  lines.push(`topix_pct\t${autoStripPct(topix.pct)}`);
  lines.push("");

  const moverBlock = (title, rows) => {
    lines.push(`[${title}]`);
    lines.push("rank\tname\tpct\tprice\tdiff");
    rows.slice(0,5).forEach((r,i) => {
      const name = autoResolveName(r.code, r.name);
      lines.push(`${i+1}\t${name}\t${autoSign(r.rate)}\t${String(r.price||"").replace(/,/g,"")}\t${autoSign(r.change)}`);
    });
    lines.push("");
  };
  moverBlock("RISERS", rise);
  moverBlock("DECLINERS", drop);

  const sectorBlock = (title, rows) => {
    lines.push(`[${title}]`);
    lines.push("rank\tsector\tpct\tper");
    rows.slice(0,5).forEach((r,i) => {
      lines.push(`${i+1}\t${r.name||""}\t${autoStripPct(r.rate)}\t${autoStrip倍(r.per)}`);
    });
    lines.push("");
  };
  sectorBlock("SECTOR_TOP", secTop);
  sectorBlock("SECTOR_WORST", secWorst);

  return lines.join("\n").trim() + "\n";
}

function autoRenderSourcesSummary(sources){
  return (sources||[]).map(s => {
    const dot = s.ok ? '<span style="color:#4ade80">●</span>' : '<span style="color:#f87171">●</span>';
    const cnt = s.rowCount ? ` ${s.rowCount}行` : "";
    const warn = s.ok ? "" : ` <span style="color:#f87171">⚠ ${s.error||s.reason||"取得エラー"}</span>`;
    return `<div>${dot} ${s.label}<span style="color:var(--muted)"> (${s.status||"-"}${cnt})</span>${warn}</div>`;
  }).join("");
}

function boot(){
  $("formatSample").textContent = formatSample;
  const input = $("input");
  input.value = formatSample;

  const doRender = () => {
    try{
      const hires = $("hiresPreview").checked;
      const {errs} = renderFromText(input.value, {hires});
      if(errs.length){
        setStatus("err", errs.join(" / "));
      }else{
        setStatus("ok", "OK");
      }
    }catch(e){
      setStatus("err", "パースに失敗: " + (e?.message || e));
    }
  };

  const doClear = () => {
    input.value = "";
    doRender();
    setStatus("ok", "クリアしました");
    input.focus();
  };

  const doPaste = async () => {
    // Clipboard API requires HTTPS (or localhost). file:// may not allow it.
    try{
      if(!navigator.clipboard || !navigator.clipboard.readText){
        setStatus("err", "貼付ボタンはHTTPS環境で利用できます。右クリック/長押しで貼り付けてください。");
        return;
      }
      const t = await navigator.clipboard.readText();
      if(!t){
        setStatus("err", "クリップボードが空です");
        return;
      }
      input.value = t;
      doRender();
      setStatus("ok", "貼り付けました");
      input.focus();
    }catch(e){
      setStatus("err", "クリップボード読み取りに失敗しました。右クリック/長押しで貼り付けてください。");
    }
  };


  $("btnRender").addEventListener("click", doRender);
  const btnClear = $("btnClear");
  const btnPaste = $("btnPaste");
  if(btnClear) btnClear.addEventListener("click", doClear);
  if(btnPaste) btnPaste.addEventListener("click", () => { doPaste(); });
  $("hiresPreview").addEventListener("change", doRender);

  $("btnDownload").addEventListener("click", downloadPNG);

  // auto render on paste with debounce
  let t = null;
  input.addEventListener("input", () => {
    clearTimeout(t);
    t = setTimeout(doRender, 200);
  });

  doRender();

  // ---- 前場プロンプト（C:\work\movie/script.js:266-287 の market_morningsession より移植）----
  const ZENBA_PROMPTS = {
    urls: `https://quote.nomura.co.jp/nomura/cgi-bin/quote.cgi?template=nomura_tp_index_01
https://www.nikkei.com/marketdata/ranking-jp/price-rise/?market=G_TP
https://www.nikkei.com/marketdata/ranking-jp/price-drop/?market=G_TP
https://s.kabutan.jp/warnings/sector_stocks_ranking/
https://s.kabutan.jp/warnings/sector_stocks_ranking/?direction=asc&order=prev_price_ratio`,
    rank: `東証プライム市場の上昇率・下落率ランキングTOP5の銘柄の証券コード、銘柄名を以下の形式で出力してください。
一覧のタイトル・一覧以外の内容は一切記述しないでください。

上昇率TOP5
（上昇率上位の表）
下落率TOP5
（下落率上位の表）`,
    Notify: `SNSへの投稿内容を以下の形式で作成してください。
日付、日経平均、TOPIXの値だけ書き換えて、以下の形式で出力すること。
以下の形式に記載のない内容（説明や返答）は一切記載しないこと。
改行位置も以下の通りに記載すること

今日の東証マーケット前場の振り返り速報！
M月Dの値動きサクッと確認👇
📉日経平均：XX,XXX.XX円（+X,XXX.XX円）
📉TOPIX：X,XXX.XX（+XX.XX）
▼1日の総まとめと明日の戦略は、今夜の動画で解説します！
フォローしてお待ちください
#日本株 #日経平均 #急騰銘柄`,
    grafic: `以下の形式で【市場データ】（指数、上昇率上位5銘柄、下落率上位5銘柄、業種変動率上位5業種、業種変動率下位5業種 ）を出力してください。
銘柄名は銘柄名一覧表の「銘柄名（正式）」を使用してください。
ただし、銘柄名一覧表にない場合は、ソースの名称もしくはレポートの名称を使用してください。
銘柄名は、ホールディングスはＨＤ、フィナンシャルグループ はＦＧ、グループはＧに変換してください。

【市場データ】
[MARKET]
title\t1分でわかる！今日の株式市場
date\t2026/03/04
timing\t前引け
nikkei_value\t54090.11
nikkei_diff\t-2188.94
nikkei_pct\t-3.89
topix_value\t3611.96
topix_diff\t-160.21
topix_pct\t-4.25

[RISERS]
rank\tname\tpct\tprice\tdiff
1\tTOKYO BASE\t+7.42\t391\t+27
2\tベイカレント\t+6.34\t4529\t+270
3\tニデック\t+6.00\t2402\t+136
4\tギフティ\t+4.74\t995\t+45
5\tメドレー\t+4.32\t1859\t+77

[DECLINERS]
rank\tname\tpct\tprice\tdiff
1\t日鉄鉱業\t-14.82\t3420\t-595
2\tオプトラン\t-13.19\t2752\t-418
3\t大阪チタニウムテクノロジーズ\t-12.92\t2852\t-423
4\t正興電機製作所\t-12.41\t2231\t-316
5\t三井E&S\t-12.28\t6829\t-956

[SECTOR_TOP]
rank\tsector\tpct\tper
1\tその他製品\t-0.71\t18.5
2\tサービス業\t-0.94\t25.1
3\t小売業\t-1.02\t22.8
4\t空運業\t-1.82\t19.4
5\t陸運業\t-2.13\t20.7

[SECTOR_WORST]
rank\tsector\tpct\tper
1\t非鉄金属\t-7.85\t12.3
2\t石油・石炭\t-7.41\t9.8
3\tガラス・土石\t-6.49\t15.6
4\t卸売業\t-6.39\t16.2
5\t銀行業\t-6.31\t14.7`,
  };

  const zenbaStatus = $("zenbaStatus");
  const setZenbaStatus = (kind, msg) => {
    if(!zenbaStatus) return;
    zenbaStatus.classList.remove("ok","err");
    if(kind) zenbaStatus.classList.add(kind);
    zenbaStatus.textContent = msg || "";
  };

  const copyZenba = async (key, btn) => {
    const text = ZENBA_PROMPTS[key];
    try{
      if(!navigator.clipboard || !navigator.clipboard.writeText){
        throw new Error("clipboard API unavailable");
      }
      await navigator.clipboard.writeText(text);
      setZenbaStatus("ok", `コピーしました: ${btn.textContent}`);
    }catch(e){
      // Fallback: textarea + execCommand
      try{
        const ta = document.createElement("textarea");
        ta.value = text;
        ta.style.position = "fixed";
        ta.style.opacity = "0";
        document.body.appendChild(ta);
        ta.select();
        document.execCommand("copy");
        ta.remove();
        setZenbaStatus("ok", `コピーしました: ${btn.textContent}`);
      }catch(e2){
        setZenbaStatus("err", "クリップボードに書き込めませんでした");
      }
    }
  };

  const bindZenba = (id, key) => {
    const b = $(id);
    if(b) b.addEventListener("click", (e) => copyZenba(key, e.currentTarget));
  };
  bindZenba("btnZenbaUrls",   "urls");
  bindZenba("btnZenbaRank",   "rank");
  bindZenba("btnZenbaNotify", "Notify");
  bindZenba("btnZenbaGrafic", "grafic");

  // ---- タブ切替 ----
  const switchTab = (name) => {
    document.querySelectorAll(".tab-btn").forEach(b => b.classList.toggle("active", b.dataset.tab === name));
    document.querySelectorAll(".tab-panel").forEach(p => p.classList.toggle("is-hidden", p.dataset.tab !== name));
  };
  document.querySelectorAll(".tab-btn").forEach(b => {
    b.addEventListener("click", () => switchTab(b.dataset.tab));
  });

  // ---- 自動取得タブ ----
  const autoDate = $("autoDate");
  if(autoDate && !autoDate.value) autoDate.value = autoTodayStr();

  const dictInfo = $("autoDictInfo");
  if(dictInfo){
    dictInfo.textContent = (autoDictReady() && window.MEIGARA_META)
      ? `銘柄辞書：${window.MEIGARA_META.count}銘柄 / 基準日 ${window.MEIGARA_META.date}`
      : "⚠ 銘柄辞書が読み込めていません（meigara-dict.js）";
  }

  const setAutoStatus = (kind, msg) => {
    const el = $("autoStatus");
    if(!el) return;
    el.classList.remove("ok","err");
    if(kind) el.classList.add(kind);
    el.textContent = msg || "";
  };

  const autoFetch = async () => {
    const btn = $("btnAutoFetch");
    const resultEl = $("autoResult");
    btn.disabled = true;
    const label = btn.textContent;
    btn.textContent = "取得中…";
    setAutoStatus("", "データ取得中…（野村・日経・株探）");
    if(resultEl) resultEl.innerHTML = "";
    try{
      const res = await fetch("/api/fetch-sources");
      if(!res.ok) throw new Error("サーバー応答エラー: " + res.status);
      const data = await res.json();
      const sources = data.sources || [];
      const okN = sources.filter(s => s.ok).length;
      if(resultEl) resultEl.innerHTML = autoRenderSourcesSummary(sources);

      const meta = { date: (autoDate && autoDate.value.trim()) || "", timing: ($("autoTiming") && $("autoTiming").value.trim()) || "" };
      const tsv = buildAutoTSV(sources, meta);

      // 入力欄に反映＋即プレビュー
      input.value = tsv;
      const {errs} = renderFromText(tsv, { hires: $("hiresPreview").checked });
      setStatus(errs.length ? "err" : "ok", errs.length ? errs.join(" / ") : "OK");

      const errN = sources.length - okN;
      setAutoStatus(errN>0 ? "err" : "ok", errN>0 ? `⚠ 取得完了（${errN}件エラー・下を確認）／入力欄に反映しました` : "✅ 取得・変換完了。入力欄に反映しました");
    }catch(e){
      setAutoStatus("err", "❌ " + (e && e.message ? e.message : e));
    }finally{
      btn.disabled = false;
      btn.textContent = label;
    }
  };

  const autoBtn = $("btnAutoFetch");
  if(autoBtn) autoBtn.addEventListener("click", autoFetch);
}

document.addEventListener("DOMContentLoaded", boot);
