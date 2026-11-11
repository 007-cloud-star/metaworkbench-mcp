// Forest-plot statistics + SVG rendering — ported from
// metaworkbench/forest-plot-generator/index.html ("STATS CORE" block and the
// SVG geometry in render()). Inverse-variance pooling: fixed-effect plus
// DerSimonian–Laird random-effects, with Cochran's Q, I² and τ².

export var Z975 = 1.959963984540054;

function gammln(xx) {
  var cof = [76.18009172947146, -86.50532032941677, 24.01409824083091,
             -1.231739572450155, 0.001208650973866179, -0.000005395239384953];
  var x = xx, y = xx, tmp = x + 5.5, ser = 1.000000000190015, j;
  tmp -= (x + 0.5) * Math.log(tmp);
  for (j = 0; j < 6; j++) { ser += cof[j] / ++y; }
  return -tmp + Math.log(2.5066282746310005 * ser / x);
}
function gammaPSeries(a, x) {
  var ap = a, sum = 1 / a, del = sum, n;
  for (n = 0; n < 500; n++) {
    ap += 1; del *= x / ap; sum += del;
    if (Math.abs(del) < Math.abs(sum) * 1e-14) break;
  }
  return sum * Math.exp(-x + a * Math.log(x) - gammln(a));
}
function gammaQCf(a, x) {
  var tiny = 1e-300, b = x + 1 - a, c = 1 / tiny, d = 1 / b, h = d, i;
  for (i = 1; i < 500; i++) {
    var an = -i * (i - a);
    b += 2; d = an * d + b; if (Math.abs(d) < tiny) d = tiny;
    c = b + an / c; if (Math.abs(c) < tiny) c = tiny;
    d = 1 / d; var del = d * c; h *= del;
    if (Math.abs(del - 1) < 1e-14) break;
  }
  return Math.exp(-x + a * Math.log(x) - gammln(a)) * h;
}
export function gammaQ(a, x) {
  if (x < 0 || a <= 0) return NaN;
  if (x === 0) return 1;
  return x < a + 1 ? 1 - gammaPSeries(a, x) : gammaQCf(a, x);
}
export function chiSquareSf(q, df) { return gammaQ(df / 2, q / 2); }
export function normTwoSidedP(z) { return gammaQ(0.5, z * z / 2); }

// studies: [{name, eff, lo, hi}] on the reported scale.
// logScale: pool log(effect). Returns analysis-scale + reported-scale results.
export function analyse(studies, logScale) {
  var pts = studies.map(function (s) {
    var th = logScale ? Math.log(s.eff) : s.eff;
    var l = logScale ? Math.log(s.lo) : s.lo;
    var u = logScale ? Math.log(s.hi) : s.hi;
    var se = (u - l) / (2 * Z975);
    return { name: s.name, eff: s.eff, lo: s.lo, hi: s.hi, theta: th, se: se, v: se * se };
  });
  var k = pts.length, i;
  var sw = 0, swt = 0;
  for (i = 0; i < k; i++) { var w = 1 / pts[i].v; pts[i].wF = w; sw += w; swt += w * pts[i].theta; }
  var estF = swt / sw, seF = Math.sqrt(1 / sw);
  var Q = 0, sw2 = 0;
  for (i = 0; i < k; i++) { Q += pts[i].wF * Math.pow(pts[i].theta - estF, 2); sw2 += pts[i].wF * pts[i].wF; }
  var df = k - 1;
  var pQ = df > 0 ? chiSquareSf(Q, df) : NaN;
  var I2 = (df > 0 && Q > 0) ? Math.max(0, (Q - df) / Q) * 100 : 0;
  var C = sw - sw2 / sw;
  var tau2 = (df > 0 && C > 0) ? Math.max(0, (Q - df) / C) : 0;
  var swr = 0, swrt = 0;
  for (i = 0; i < k; i++) { pts[i].wR = 1 / (pts[i].v + tau2); swr += pts[i].wR; swrt += pts[i].wR * pts[i].theta; }
  var estR = swrt / swr, seR = Math.sqrt(1 / swr);
  for (i = 0; i < k; i++) { pts[i].wPctF = 100 * pts[i].wF / sw; pts[i].wPctR = 100 * pts[i].wR / swr; }
  function pack(est, se) {
    var z = est / se;
    var back = function (x) { return logScale ? Math.exp(x) : x; };
    return { est: back(est), lo: back(est - Z975 * se), hi: back(est + Z975 * se),
             estA: est, seA: se, z: z, p: normTwoSidedP(z) };
  }
  return { studies: pts, k: k, fixed: pack(estF, seF), random: pack(estR, seR),
           Q: Q, df: df, pQ: pQ, I2: I2, tau2: tau2 };
}

export var MEASURES = {
  OR:  { log: true,  long: "Odds Ratio",          short: "OR" },
  RR:  { log: true,  long: "Risk Ratio",           short: "RR" },
  MD:  { log: false, long: "Mean Difference",      short: "MD" },
  SMD: { log: false, long: "Std. Mean Difference", short: "SMD" }
};

export function fmt(x, d) {
  if (!isFinite(x)) return "—";
  return x.toFixed(d == null ? 2 : d);
}
export function fmtP(p) {
  if (!isFinite(p)) return "—";
  if (p < 0.001) return "<0.001";
  return p.toFixed(3);
}
export function esc(t) { return String(t).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;"); }

function niceTicksLinear(lo, hi) {
  var range = hi - lo, rough = range / 5, mag = Math.pow(10, Math.floor(Math.log10(rough)));
  var norm = rough / mag, step;
  if (norm < 1.5) step = mag; else if (norm < 3.5) step = 2 * mag; else if (norm < 7.5) step = 5 * mag; else step = 10 * mag;
  var ticks = [], t = Math.ceil(lo / step) * step;
  for (; t <= hi + 1e-12; t += step) ticks.push(parseFloat(t.toPrecision(10)));
  return ticks;
}
function ticksLog(lo, hi) {
  var ticks = [], e, cand = Math.log10(hi / lo) > 2 ? [1, 2, 5] : [1, 1.5, 2, 3, 5, 7.5];
  for (e = -4; e <= 4; e++) {
    for (var j = 0; j < cand.length; j++) {
      var v = cand[j] * Math.pow(10, e);
      if (v >= lo && v <= hi) ticks.push(parseFloat(v.toPrecision(3)));
    }
  }
  if (ticks.indexOf(1) === -1 && lo < 1 && hi > 1) ticks.push(1);
  return ticks.sort(function (a, b) { return a - b; });
}
function tickLabel(v, logScale) {
  if (logScale) return String(parseFloat(v.toPrecision(2)));
  return String(parseFloat(v.toPrecision(6)));
}

// Render the forest plot SVG. studies: [{name, eff, lo, hi}];
// measureKey: "OR"|"RR"|"MD"|"SMD"; model: "both"|"fixed"|"random".
// Returns { svg, height, result } where result is the analyse() output.
export function renderForestSvg(studies, measureKey, model) {
  var M = MEASURES[measureKey];
  var R = analyse(studies, M.log);
  var showF = model === "both" || model === "fixed";
  var showR = model === "both" || model === "random";
  var useRandomWeights = model !== "fixed";

  var nullA = 0;
  var aLo = nullA, aHi = nullA;
  R.studies.forEach(function (s) {
    var l = M.log ? Math.log(s.lo) : s.lo, u = M.log ? Math.log(s.hi) : s.hi;
    aLo = Math.min(aLo, l); aHi = Math.max(aHi, u);
  });
  [R.fixed, R.random].forEach(function (p) {
    aLo = Math.min(aLo, M.log ? Math.log(p.lo) : p.lo);
    aHi = Math.max(aHi, M.log ? Math.log(p.hi) : p.hi);
  });
  var pad = (aHi - aLo) * 0.06 || 0.1;
  aLo -= pad; aHi += pad;

  var W = 1000, labelX = 218, plotX0 = 345, plotX1 = 730, ciX = 748, wX = 988;
  var rowH = 27, headH = 44, firstY = headH + rowH / 2;
  var studiesH = R.k * rowH;
  var poolRows = (showF ? 1 : 0) + (showR ? 1 : 0);
  var poolY0 = headH + studiesH + 14;
  var axisY = poolY0 + poolRows * 30 + 16;
  var H = axisY + 46;
  function X(a) { return plotX0 + (a - aLo) / (aHi - aLo) * (plotX1 - plotX0); }
  function Xdisp(v) { return X(M.log ? Math.log(v) : v); }
  var xNull = X(nullA);

  var dispLo = M.log ? Math.exp(aLo) : aLo, dispHi = M.log ? Math.exp(aHi) : aHi;
  var ticks = M.log ? ticksLog(dispLo, dispHi) : niceTicksLinear(dispLo, dispHi);

  var s = '<svg id="forestSvg" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ' + W + " " + H + '">';
  s += '<rect x="0" y="0" width="' + W + '" height="' + H + '" fill="#ffffff"/>';
  s += '<text x="0" y="26" font-size="14" font-weight="bold" fill="#111">Study</text>';
  s += '<text x="' + ((plotX0 + plotX1) / 2) + '" y="26" text-anchor="middle" font-size="14" font-weight="bold" fill="#111">' + M.long + "</text>";
  s += '<text x="' + ciX + '" y="26" font-size="14" font-weight="bold" fill="#111">' + M.short + " [95% CI]</text>";
  s += '<text x="' + wX + '" y="26" text-anchor="end" font-size="14" font-weight="bold" fill="#111">Weight</text>';
  s += '<line x1="0" y1="36" x2="' + W + '" y2="36" stroke="#333" stroke-width="1.2"/>';
  s += '<line x1="' + xNull + '" y1="38" x2="' + xNull + '" y2="' + axisY + '" stroke="#999" stroke-width="1" stroke-dasharray="5 4"/>';
  ticks.forEach(function (t) {
    var x = Xdisp(t);
    s += '<line x1="' + x + '" y1="38" x2="' + x + '" y2="' + axisY + '" stroke="#eee" stroke-width="1"/>';
  });

  var maxW = 0;
  R.studies.forEach(function (st) { maxW = Math.max(maxW, useRandomWeights ? st.wPctR : st.wPctF); });

  R.studies.forEach(function (st, idx) {
    var cy = firstY + idx * rowH;
    var wpct = useRandomWeights ? st.wPctR : st.wPctF;
    s += '<text x="' + labelX + '" y="' + (cy + 5) + '" text-anchor="end" font-size="13.5" fill="#111">' + esc(st.name) + "</text>";
    var lx = Xdisp(st.lo), rx = Xdisp(st.hi), cx = Xdisp(st.eff);
    var lClamp = Math.max(lx, plotX0), rClamp = Math.min(rx, plotX1);
    s += '<line x1="' + lClamp + '" y1="' + cy + '" x2="' + rClamp + '" y2="' + cy + '" stroke="#333" stroke-width="1.6"/>';
    if (lx < plotX0) s += '<polygon points="' + plotX0 + "," + cy + " " + (plotX0 + 7) + "," + (cy - 4) + " " + (plotX0 + 7) + "," + (cy + 4) + '" fill="#333"/>';
    else s += '<line x1="' + lx + '" y1="' + (cy - 5) + '" x2="' + lx + '" y2="' + (cy + 5) + '" stroke="#333" stroke-width="1.6"/>';
    if (rx > plotX1) s += '<polygon points="' + plotX1 + "," + cy + " " + (plotX1 - 7) + "," + (cy - 4) + " " + (plotX1 - 7) + "," + (cy + 4) + '" fill="#333"/>';
    else s += '<line x1="' + rx + '" y1="' + (cy - 5) + '" x2="' + rx + '" y2="' + (cy + 5) + '" stroke="#333" stroke-width="1.6"/>';
    var side = Math.max(5, 17 * Math.sqrt((useRandomWeights ? st.wPctR : st.wPctF) / (maxW || 1)));
    s += '<rect x="' + (cx - side / 2) + '" y="' + (cy - side / 2) + '" width="' + side + '" height="' + side + '" fill="#0b5394"/>';
    s += '<text x="' + ciX + '" y="' + (cy + 5) + '" font-size="13.5" fill="#111">' + fmt(st.eff) + " [" + fmt(st.lo) + ", " + fmt(st.hi) + "]</text>";
    s += '<text x="' + wX + '" y="' + (cy + 5) + '" text-anchor="end" font-size="13.5" fill="#111">' + fmt(wpct, 1) + "%</text>";
  });

  s += '<line x1="0" y1="' + (poolY0 - 8) + '" x2="' + W + '" y2="' + (poolY0 - 8) + '" stroke="#333" stroke-width="1.2"/>';
  var prow = 0;
  function diamond(pack, label, cy) {
    var cx = Xdisp(pack.est), lx = Math.max(Xdisp(pack.lo), plotX0), rx = Math.min(Xdisp(pack.hi), plotX1);
    var h = 10;
    s += '<text x="' + labelX + '" y="' + (cy + 5) + '" text-anchor="end" font-size="13.5" font-weight="bold" fill="#111">' + label + "</text>";
    s += '<polygon points="' + lx + "," + cy + " " + cx + "," + (cy - h) + " " + rx + "," + cy + " " + cx + "," + (cy + h) + '" fill="#0b5394"/>';
    s += '<text x="' + ciX + '" y="' + (cy + 5) + '" font-size="13.5" font-weight="bold" fill="#111">' + fmt(pack.est) + " [" + fmt(pack.lo) + ", " + fmt(pack.hi) + "]</text>";
  }
  if (showF) { diamond(R.fixed, "Total (fixed-effect)", poolY0 + prow * 30 + 11); prow++; }
  if (showR) { diamond(R.random, "Total (random-effects)", poolY0 + prow * 30 + 11); prow++; }

  s += '<line x1="' + plotX0 + '" y1="' + axisY + '" x2="' + plotX1 + '" y2="' + axisY + '" stroke="#333" stroke-width="1.2"/>';
  ticks.forEach(function (t) {
    var x = Xdisp(t);
    s += '<line x1="' + x + '" y1="' + axisY + '" x2="' + x + '" y2="' + (axisY + 6) + '" stroke="#333" stroke-width="1.2"/>';
    s += '<text x="' + x + '" y="' + (axisY + 22) + '" text-anchor="middle" font-size="12.5" fill="#333">' + tickLabel(t, M.log) + "</text>";
  });
  s += '<text x="' + ((plotX0 + plotX1) / 2) + '" y="' + (axisY + 42) + '" text-anchor="middle" font-size="12.5" fill="#555">' + M.long + (M.log ? " (log scale)" : "") + "</text>";
  s += "</svg>";
  return { svg: s, height: H, result: R };
}

// Plain-text pooled-results summary (mirrors the web tool's stats box).
export function forestSummaryText(R, measureKey) {
  var M = MEASURES[measureKey];
  var lines = [];
  lines.push("Pooled results (k = " + R.k + ", measure = " + M.long + ")");
  lines.push("Fixed-effect: " + M.short + " = " + fmt(R.fixed.est, 3) + " [95% CI " + fmt(R.fixed.lo, 3) + " to " + fmt(R.fixed.hi, 3) + "], z = " + fmt(R.fixed.z, 2) + ", p = " + fmtP(R.fixed.p));
  lines.push("Random-effects (DerSimonian–Laird): " + M.short + " = " + fmt(R.random.est, 3) + " [95% CI " + fmt(R.random.lo, 3) + " to " + fmt(R.random.hi, 3) + "], z = " + fmt(R.random.z, 2) + ", p = " + fmtP(R.random.p));
  lines.push("Heterogeneity: Q = " + fmt(R.Q, 2) + " (df = " + R.df + ", p = " + fmtP(R.pQ) + "), I² = " + fmt(R.I2, 1) + "%, τ² = " + fmt(R.tau2, 4));
  return lines.join("\n");
}

// JSON-friendly copy of the analysis (no functions, finite numbers kept raw).
export function forestStructured(R, measureKey, model) {
  function packOut(p) {
    return { estimate: p.est, ciLower: p.lo, ciUpper: p.hi, z: p.z, pValue: p.p };
  }
  return {
    measure: measureKey,
    modelShown: model,
    k: R.k,
    fixedEffect: packOut(R.fixed),
    randomEffectsDL: packOut(R.random),
    heterogeneity: { Q: R.Q, df: R.df, pValue: R.pQ, iSquaredPct: R.I2, tauSquared: R.tau2 },
    studies: R.studies.map(function (s) {
      return { name: s.name, effect: s.eff, ciLower: s.lo, ciUpper: s.hi,
               weightPctFixed: s.wPctF, weightPctRandom: s.wPctR };
    })
  };
}
