// Sample-size core — ported verbatim (pure functions only) from
// metaworkbench/sample-size-calculator/index.html ("SAMPLE SIZE CORE" block).
// Normal-approximation formulas for two means, two proportions and
// non-inferiority designs, with attrition adjustment.

export function normInv(p) {
  if (!(p > 0 && p < 1)) return NaN;
  var a = [-39.69683028665376, 220.9460984245205, -275.9285104469687, 138.3577518672690, -30.66479806614716, 2.506628277459239];
  var b = [-54.47609879822406, 161.5858368580409, -155.6989798598866, 66.80131188771972, -13.28068155288572];
  var c = [-0.007784894002430293, -0.3223964580411365, -2.400758277161838, -2.549732539343734, 4.374664141464968, 2.938163982698783];
  var d = [0.007784695709041462, 0.3224671290700398, 2.445134137142996, 3.754408661907416];
  var pLow = 0.02425, pHigh = 1 - pLow, q, r, num, den;
  if (p < pLow) {
    q = Math.sqrt(-2 * Math.log(p));
    num = (((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]);
    den = ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1);
    return num / den;
  }
  if (p <= pHigh) {
    q = p - 0.5; r = q * q;
    num = (((((a[0] * r + a[1]) * r + a[2]) * r + a[3]) * r + a[4]) * r + a[5]) * q;
    den = (((((b[0] * r + b[1]) * r + b[2]) * r + b[3]) * r + b[4]) * r + 1);
    return num / den;
  }
  q = Math.sqrt(-2 * Math.log(1 - p));
  num = (((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]);
  den = ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1);
  return -num / den;
}

export function zAlpha(alpha, sided) {
  return sided === "one" ? normInv(1 - alpha) : normInv(1 - alpha / 2);
}

function finish(raw1, ratio, attrition) {
  var n1 = Math.ceil(raw1);
  var n2 = Math.ceil(raw1 * ratio);
  var a1 = Math.ceil(n1 / (1 - attrition));
  var a2 = Math.ceil(n2 / (1 - attrition));
  return { raw1: raw1, raw2: raw1 * ratio, n1: n1, n2: n2, total: n1 + n2,
           adj1: a1, adj2: a2, adjTotal: a1 + a2 };
}

export function twoMeans(o) {
  var z = zAlpha(o.alpha, o.sided) + normInv(o.power);
  var variance = o.sd1 * o.sd1 + (o.sd2 * o.sd2) / o.ratio;
  var raw1 = z * z * variance / (o.diff * o.diff);
  return { zAlpha: zAlpha(o.alpha, o.sided), zPower: normInv(o.power), zSum: z,
           varianceTerm: variance, result: finish(raw1, o.ratio, o.attrition) };
}

export function twoProportions(o) {
  var za = zAlpha(o.alpha, o.sided), zb = normInv(o.power);
  var delta = Math.abs(o.p1 - o.p2);
  var pBar = (o.p1 + o.ratio * o.p2) / (1 + o.ratio);
  var nullTerm = Math.sqrt((1 + 1 / o.ratio) * pBar * (1 - pBar));
  var altTerm = Math.sqrt(o.p1 * (1 - o.p1) + o.p2 * (1 - o.p2) / o.ratio);
  var raw1 = Math.pow(za * nullTerm + zb * altTerm, 2) / (delta * delta);
  return { zAlpha: za, zPower: zb, pBar: pBar, nullTerm: nullTerm, altTerm: altTerm,
           result: finish(raw1, o.ratio, o.attrition) };
}

// o: { alpha (one-sided), power, ratio, attrition, direction: "higher"|"lower",
//      expectedDiff, margin, varianceTerm }
export function nonInferiority(o) {
  var z = normInv(1 - o.alpha) + normInv(o.power);
  var distance = o.direction === "higher" ? o.expectedDiff + o.margin : o.margin - o.expectedDiff;
  var raw1 = z * z * o.varianceTerm / (distance * distance);
  return { zAlpha: normInv(1 - o.alpha), zPower: normInv(o.power), zSum: z,
           distance: distance, result: finish(raw1, o.ratio, o.attrition) };
}
