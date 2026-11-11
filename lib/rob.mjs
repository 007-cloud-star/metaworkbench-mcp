// RoB 2 core + SVG rendering — ported from
// metaworkbench/rob-traffic-light-generator/index.html ("ROB CORE" block and
// the traffic-light / summary renderers). Overall judgement follows the
// RoB 2 rule (worst domain wins); manual overrides are honoured.

export var DOMAINS = [
  { short: "D1", name: "Randomization process" },
  { short: "D2", name: "Deviations from intended interventions" },
  { short: "D3", name: "Missing outcome data" },
  { short: "D4", name: "Measurement of the outcome" },
  { short: "D5", name: "Selection of the reported result" }
];
export var JUDGE = {
  L: { label: "Low risk",      short: "Low",  color: "#00a651", tint: "#e3f4e8", symbol: "+" },
  S: { label: "Some concerns", short: "Some", color: "#f2c500", tint: "#fdf3c4", symbol: "!" },
  H: { label: "High risk",     short: "High", color: "#d92323", tint: "#f9dcdc", symbol: "×" }
};

// RoB 2 overall-judgement algorithm: worst domain wins.
// raiseNote: study lands on "Some concerns" with 2+ some-concerns domains —
// RoB 2 guidance allows considering an overall High there (never auto-applied).
export function computeOverall(domains) {
  var sc = 0, i;
  for (i = 0; i < domains.length; i++) {
    if (domains[i] === "H") return { overall: "H", scCount: sc, raiseNote: false };
    if (domains[i] === "S") sc++;
  }
  if (sc > 0) return { overall: "S", scCount: sc, raiseNote: sc >= 2 };
  return { overall: "L", scCount: 0, raiseNote: false };
}

export function parseJudgment(tok) {
  if (tok == null) return null;
  var t = String(tok).trim().toLowerCase();
  if (t === "l" || t === "low" || t === "low risk" || t === "+") return "L";
  if (t === "s" || t === "sc" || t === "some" || t === "some concern" || t === "some concerns" || t === "!") return "S";
  if (t === "h" || t === "high" || t === "high risk" || t === "×" || t === "x") return "H";
  return null;
}

// Normalise raw tool input into the study shape the renderers expect:
// { name, n, domains: [L|S|H x5], auto, scCount, raiseNote, override, overall }
// Throws Error with a readable message on bad input.
export function prepareStudies(raw) {
  if (!Array.isArray(raw) || raw.length === 0) throw new Error("studies must be a non-empty array");
  return raw.map(function (s, idx) {
    var name = s.name != null && String(s.name).trim() !== "" ? String(s.name) : "Study " + (idx + 1);
    var n = (typeof s.n === "number" && isFinite(s.n) && s.n > 0) ? s.n : null;
    if (!Array.isArray(s.domains) || s.domains.length !== 5) {
      throw new Error("Study \"" + name + "\": domains must be an array of 5 judgements (D1..D5)");
    }
    var doms = s.domains.map(function (d, di) {
      var j = parseJudgment(d);
      if (!j) throw new Error("Study \"" + name + "\": unrecognised judgement for " + DOMAINS[di].short + ": " + d);
      return j;
    });
    var ov = null;
    if (s.overall != null && String(s.overall).trim() !== "") {
      ov = parseJudgment(s.overall);
      if (!ov) throw new Error("Study \"" + name + "\": unrecognised overall judgement: " + s.overall);
    }
    var auto = computeOverall(doms);
    return { name: name, n: n, domains: doms,
             auto: auto.overall, scCount: auto.scCount, raiseNote: auto.raiseNote,
             override: ov, overall: ov || auto.overall };
  });
}

// One row per domain plus a final Overall row, with counts and percentages.
// Weighted: each study contributes its N; studies without N are excluded.
export function summarize(studies, weighted) {
  var useW = !!weighted, excluded = 0, fellBack = false, i;
  if (useW) {
    var anyN = false;
    for (i = 0; i < studies.length; i++) if (studies[i].n != null) { anyN = true; break; }
    if (!anyN) { useW = false; fellBack = true; }
  }
  function tally(get) {
    var c = { L: 0, S: 0, H: 0 }, denom = 0;
    studies.forEach(function (s) {
      var wgt = 1;
      if (useW) {
        if (s.n == null) return;
        wgt = s.n;
      }
      c[get(s)] += wgt; denom += wgt;
    });
    return { counts: c, denom: denom };
  }
  var rows = DOMAINS.map(function (d, di) {
    var t = tally(function (s) { return s.domains[di]; });
    return { key: d.short, label: d.short + " · " + d.name, counts: t.counts, denom: t.denom };
  });
  var to = tally(function (s) { return s.overall; });
  rows.push({ key: "Overall", label: "Overall", counts: to.counts, denom: to.denom });
  rows.forEach(function (r) {
    r.pL = r.denom > 0 ? 100 * r.counts.L / r.denom : 0;
    r.pS = r.denom > 0 ? 100 * r.counts.S / r.denom : 0;
    r.pH = r.denom > 0 ? 100 * r.counts.H / r.denom : 0;
  });
  if (useW) studies.forEach(function (s) { if (s.n == null) excluded++; });
  return { rows: rows, weighted: useW, excluded: excluded, fellBack: fellBack };
}

function fmt(x, d) { return isFinite(x) ? x.toFixed(d == null ? 1 : d) : "—"; }
function esc(t) { return String(t).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;"); }

function circle(cx, cy, j, r) {
  return '<circle cx="' + cx + '" cy="' + cy + '" r="' + r + '" fill="' + JUDGE[j].color + '"/>' +
    '<text x="' + cx + '" y="' + (cy + r * 0.38) + '" text-anchor="middle" font-size="' + (r * 1.15) + '" font-weight="bold" fill="#111">' + JUDGE[j].symbol + "</text>";
}

export function renderTrafficSvg(studies) {
  var W = 1000, headH = 48, rowH = 36, firstCY = headH + rowH / 2;
  var H = headH + studies.length * rowH + 40;
  var colX = [395, 490, 585, 680, 775], ovX = 898;
  var s = '<svg id="robTrafficSvg" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ' + W + " " + H + '">';
  s += '<rect x="0" y="0" width="' + W + '" height="' + H + '" fill="#ffffff"/>';
  s += '<text x="262" y="28" text-anchor="end" font-size="14" font-weight="bold" fill="#111">Study</text>';
  s += '<text x="322" y="28" text-anchor="end" font-size="14" font-weight="bold" fill="#111">N</text>';
  colX.forEach(function (x, i) {
    s += '<text x="' + x + '" y="28" text-anchor="middle" font-size="14" font-weight="bold" fill="#111">' + DOMAINS[i].short + "</text>";
  });
  s += '<text x="' + ovX + '" y="28" text-anchor="middle" font-size="14" font-weight="bold" fill="#111">Overall</text>';
  s += '<line x1="0" y1="38" x2="' + W + '" y2="38" stroke="#333" stroke-width="1.2"/>';
  s += '<line x1="338" y1="42" x2="338" y2="' + (H - 44) + '" stroke="#e2e2e2" stroke-width="1"/>';
  s += '<line x1="832" y1="42" x2="832" y2="' + (H - 44) + '" stroke="#ccc" stroke-width="1"/>';
  studies.forEach(function (st, idx) {
    var cy = firstCY + idx * rowH;
    s += '<text x="262" y="' + (cy + 5) + '" text-anchor="end" font-size="13.5" fill="#111">' + esc(st.name) + "</text>";
    s += '<text x="322" y="' + (cy + 5) + '" text-anchor="end" font-size="12.5" fill="#555">' + (st.n == null ? "" : st.n) + "</text>";
    st.domains.forEach(function (j, di) { s += circle(colX[di], cy, j, 13.5); });
    s += circle(ovX, cy, st.overall, 13.5);
    if (!st.override && st.raiseNote) {
      s += '<text x="' + (ovX + 19) + '" y="' + (cy + 5) + '" font-size="14" font-weight="bold" fill="#b03a2e">†</text>';
    }
  });
  var ly = H - 14, lx = 0;
  ["L", "S", "H"].forEach(function (j) {
    s += circle(lx + 8, ly - 4, j, 7.5);
    s += '<text x="' + (lx + 22) + '" y="' + ly + '" font-size="12.5" fill="#333">' + JUDGE[j].label + "</text>";
    lx += j === "L" ? 110 : (j === "S" ? 140 : 110);
  });
  if (studies.some(function (st) { return !st.override && st.raiseNote; })) {
    s += '<text x="' + W + '" y="' + ly + '" text-anchor="end" font-size="12.5" fill="#b03a2e">† some concerns in 2+ domains — see notes</text>';
  }
  s += "</svg>";
  return { svg: s, height: H };
}

export function renderSummarySvg(studies, weighted) {
  var S = summarize(studies, weighted);
  var W = 1000, headH = 46, rowH = 36, barH = 22, barX0 = 312, barX1 = 936;
  var axisY = headH + S.rows.length * rowH + 6;
  var H = axisY + 26;
  var s = '<svg id="robSummarySvg" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ' + W + " " + H + '">';
  s += '<rect x="0" y="0" width="' + W + '" height="' + H + '" fill="#ffffff"/>';
  var lx = 0, ly = 18;
  ["L", "S", "H"].forEach(function (j) {
    s += '<rect x="' + lx + '" y="' + (ly - 10) + '" width="14" height="14" fill="' + JUDGE[j].color + '"/>';
    s += '<text x="' + (lx + 20) + '" y="' + (ly + 2) + '" font-size="12.5" fill="#333">' + JUDGE[j].label + "</text>";
    lx += j === "L" ? 100 : (j === "S" ? 140 : 100);
  });
  var modeTxt = S.weighted ? "Weighted by sample size (total N = " + S.rows[0].denom + ")" : "Unweighted (k = " + studies.length + ")";
  if (S.fellBack) modeTxt = "Unweighted (k = " + studies.length + ") — no N entered, weighting unavailable";
  s += '<text x="' + W + '" y="' + (ly + 2) + '" text-anchor="end" font-size="12.5" fill="#555">' + modeTxt + "</text>";
  [0, 25, 50, 75, 100].forEach(function (p) {
    var x = barX0 + (barX1 - barX0) * p / 100;
    s += '<line x1="' + x + '" y1="' + headH + '" x2="' + x + '" y2="' + axisY + '" stroke="#eee" stroke-width="1"/>';
    s += '<text x="' + x + '" y="' + (axisY + 18) + '" text-anchor="middle" font-size="12" fill="#555">' + p + "%</text>";
  });
  S.rows.forEach(function (r, i) {
    var y = headH + i * rowH, cy = y + rowH / 2;
    if (r.key === "Overall") {
      s += '<line x1="0" y1="' + y + '" x2="' + W + '" y2="' + y + '" stroke="#ccc" stroke-width="1"/>';
    }
    s += '<text x="296" y="' + (cy + 5) + '" text-anchor="end" font-size="13.5"' + (r.key === "Overall" ? ' font-weight="bold"' : "") + ' fill="#111">' + esc(r.label) + "</text>";
    var x = barX0;
    [["L", r.pL], ["S", r.pS], ["H", r.pH]].forEach(function (seg) {
      var w = (barX1 - barX0) * seg[1] / 100;
      if (w > 0) {
        s += '<rect x="' + x + '" y="' + (cy - barH / 2) + '" width="' + w + '" height="' + barH + '" fill="' + JUDGE[seg[0]].color + '"/>';
        if (w >= 36) {
          s += '<text x="' + (x + w / 2) + '" y="' + (cy + 4.5) + '" text-anchor="middle" font-size="12" font-weight="bold" fill="#111">' + fmt(seg[1], 1) + "%</text>";
        }
      }
      x += w;
    });
  });
  s += '<line x1="' + barX0 + '" y1="' + axisY + '" x2="' + barX1 + '" y2="' + axisY + '" stroke="#333" stroke-width="1.2"/>';
  s += "</svg>";
  return { svg: s, height: H, summary: S };
}

export function robSummaryText(studies, S) {
  var k = studies.length;
  var ov = { L: 0, S: 0, H: 0 };
  studies.forEach(function (st) { ov[st.overall]++; });
  var lines = [];
  lines.push("RoB 2 judgements (k = " + k + "): Low risk " + ov.L + " (" + fmt(100 * ov.L / k, 1) +
    "%), Some concerns " + ov.S + " (" + fmt(100 * ov.S / k, 1) +
    "%), High risk " + ov.H + " (" + fmt(100 * ov.H / k, 1) + "%)");
  lines.push("Domain counts (Low/Some/High" + (S.weighted ? ", N-weighted" : "") + "): " +
    S.rows.slice(0, 5).map(function (r) { return r.key + " " + fmt(r.counts.L, 0) + "/" + fmt(r.counts.S, 0) + "/" + fmt(r.counts.H, 0); }).join(", "));
  studies.forEach(function (st) {
    if (!st.override && st.raiseNote) {
      lines.push("† " + st.name + ": some concerns in " + st.scCount + " domains, none at high risk — RoB 2 guidance allows considering an overall High judgement; kept as Some concerns unless overridden.");
    }
    if (st.override && st.override !== st.auto) {
      lines.push(st.name + ": overall set manually to " + JUDGE[st.overall].label + " (RoB 2 rule alone would give " + JUDGE[st.auto].label + ").");
    }
  });
  if (S.weighted && S.excluded > 0) lines.push("Weighting: " + S.excluded + " of " + k + " studies have no N and are excluded from the weighted summary bars.");
  if (S.fellBack) lines.push("Weighting: weighted mode needs an N for at least one study; showing unweighted bars.");
  return lines.join("\n");
}
