#!/usr/bin/env python3
"""Independent reference computations for the metaworkbench-mcp self-test.

Implements the same published formulas with numpy/scipy, in a different
language/runtime from the Node port, so the self-test cross-checks the port
rather than restating it. Prints one JSON object to stdout.
"""
import json
import math

import numpy as np
from scipy import stats

Z975 = stats.norm.ppf(0.975)


def ceil_groups(raw, ratio, attrition):
    n1 = math.ceil(raw)
    n2 = math.ceil(raw * ratio)
    a1 = math.ceil(n1 / (1 - attrition))
    a2 = math.ceil(n2 / (1 - attrition))
    return {"raw1": raw, "n1": n1, "n2": n2, "total": n1 + n2,
            "adj1": a1, "adj2": a2, "adjTotal": a1 + a2}


def two_means(diff, sd1, sd2, alpha, power, ratio, attrition):
    za = stats.norm.ppf(1 - alpha / 2)
    zp = stats.norm.ppf(power)
    raw = (za + zp) ** 2 * (sd1 ** 2 + sd2 ** 2 / ratio) / diff ** 2
    return ceil_groups(raw, ratio, attrition)


def two_proportions(p1, p2, alpha, power, ratio, attrition):
    za = stats.norm.ppf(1 - alpha / 2)
    zp = stats.norm.ppf(power)
    pbar = (p1 + ratio * p2) / (1 + ratio)
    null_term = math.sqrt((1 + 1 / ratio) * pbar * (1 - pbar))
    alt_term = math.sqrt(p1 * (1 - p1) + p2 * (1 - p2) / ratio)
    raw = (za * null_term + zp * alt_term) ** 2 / (p1 - p2) ** 2
    return ceil_groups(raw, ratio, attrition)


def ni_binary(p_new, p_ref, margin, alpha, power, ratio, attrition):
    # lower event rate is better; distance from expected diff to NI boundary
    expected_diff = p_new - p_ref
    distance = margin - expected_diff
    var_term = p_new * (1 - p_new) + p_ref * (1 - p_ref) / ratio
    za = stats.norm.ppf(1 - alpha)
    zp = stats.norm.ppf(power)
    raw = (za + zp) ** 2 * var_term / distance ** 2
    return ceil_groups(raw, ratio, attrition)


def dl_pool(studies):
    """studies: list of (eff, lo, hi) on a ratio scale; pool log(effect)."""
    th = np.array([math.log(s[0]) for s in studies])
    se = np.array([(math.log(s[2]) - math.log(s[1])) / (2 * Z975) for s in studies])
    v = se ** 2
    w = 1 / v
    est_f = float(np.sum(w * th) / np.sum(w))
    se_f = float(math.sqrt(1 / np.sum(w)))
    q = float(np.sum(w * (th - est_f) ** 2))
    df = len(studies) - 1
    c = float(np.sum(w) - np.sum(w ** 2) / np.sum(w))
    tau2 = max(0.0, (q - df) / c) if df > 0 else 0.0
    i2 = max(0.0, (q - df) / q) * 100 if q > 0 else 0.0
    wr = 1 / (v + tau2)
    est_r = float(np.sum(wr * th) / np.sum(wr))
    se_r = float(math.sqrt(1 / np.sum(wr)))
    return {
        "fixed": {"est": math.exp(est_f), "lo": math.exp(est_f - Z975 * se_f),
                  "hi": math.exp(est_f + Z975 * se_f)},
        "random": {"est": math.exp(est_r), "lo": math.exp(est_r - Z975 * se_r),
                   "hi": math.exp(est_r + Z975 * se_r)},
        "Q": q, "df": df, "I2": i2, "tau2": tau2,
        "pQ": float(stats.chi2.sf(q, df)) if df > 0 else None,
    }


TOY = [(0.70, 0.50, 0.98), (0.85, 0.60, 1.20), (0.60, 0.35, 1.03), (1.10, 0.75, 1.61)]
DEMO = [(0.55, 0.38, 0.80), (0.92, 0.68, 1.24), (0.64, 0.41, 0.99),
        (1.08, 0.79, 1.48), (0.78, 0.60, 1.01), (0.83, 0.66, 1.04)]

out = {
    "means_case": two_means(5, 10, 10, 0.05, 0.80, 1.0, 0.0),
    "props_case": two_proportions(0.20, 0.10, 0.05, 0.80, 1.0, 0.10),
    "ni_binary_case": ni_binary(0.12, 0.10, 0.05, 0.025, 0.80, 1.0, 0.0),
    "toy_pool": dl_pool(TOY),
    "demo_pool": dl_pool(DEMO),
}
print(json.dumps(out))
