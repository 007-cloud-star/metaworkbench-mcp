#!/usr/bin/env node
// Meta Workbench MCP server (stdio).
//
// Tools (same calculation cores as the web tools at metaworkbench/):
//   sample_size        — two means / two proportions / non-inferiority
//   forest_plot        — inverse-variance pooling (fixed + DerSimonian–Laird),
//                        returns SVG; also bound to an MCP Apps UI resource
//   rob_traffic_light  — RoB 2 traffic-light plot (SVG) + summary plot (SVG)
//   prisma_diagram     — PRISMA 2020 flow diagram (SVG)
//
// MCP Apps: the forest_plot tool declares _meta.ui.resourceUri =
// "ui://metaworkbench/forest-plot"; the HTML is served as a resource with
// MIME type "text/html;profile=mcp-app". Hosts without MCP Apps support
// simply use the tool's text + structuredContent (the SVG is included as
// text), so nothing depends on the UI.

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { registerAppTool, registerAppResource, RESOURCE_MIME_TYPE } from "@modelcontextprotocol/ext-apps/server";
import { z } from "zod";

import { twoMeans, twoProportions, nonInferiority } from "./lib/sampleSize.mjs";
import { renderForestSvg, forestSummaryText, forestStructured, MEASURES } from "./lib/forest.mjs";
import { prepareStudies, renderTrafficSvg, renderSummarySvg, robSummaryText } from "./lib/rob.mjs";
import { renderPrismaSvg } from "./lib/prisma.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const FOREST_UI_URI = "ui://metaworkbench/forest-plot";
const forestAppHtml = readFileSync(join(HERE, "app", "forest-plot.html"), "utf8");

const server = new McpServer(
  { name: "metaworkbench", version: "0.1.0" },
  {
    capabilities: {
      extensions: {
        "io.modelcontextprotocol/ui": { mimeTypes: [RESOURCE_MIME_TYPE] }
      }
    },
    instructions:
      "Meta Workbench tools for systematic reviewers: sample-size calculation, " +
      "forest plots with DerSimonian–Laird pooling, RoB 2 traffic-light plots, " +
      "and PRISMA 2020 flow diagrams. All computation is local and deterministic."
  }
);

function textResult(text, structured) {
  const r = { content: [{ type: "text", text }] };
  if (structured !== undefined) r.structuredContent = structured;
  return r;
}
function errorResult(err) {
  return { content: [{ type: "text", text: "Error: " + (err && err.message ? err.message : String(err)) }], isError: true };
}
function validCommon(alpha, powerPct, ratio, attritionPct) {
  if (!(alpha > 0 && alpha < 0.5)) return "Alpha must be greater than 0 and less than 0.5.";
  if (!(powerPct > 50 && powerPct < 99.95)) return "Power must be greater than 50% and less than 99.95%.";
  if (!(ratio > 0 && ratio <= 20)) return "The allocation ratio must be greater than 0 and no more than 20.";
  if (!(attritionPct >= 0 && attritionPct < 95)) return "Attrition must be at least 0% and less than 95%.";
  return "";
}

// ---------------------------------------------------------------- sample_size
const sampleSizeSchema = z.object({
  design: z.enum(["means", "proportions", "noninferiority"]).describe("Study design to size"),
  // shared
  alpha: z.number().optional().describe("Significance level (default 0.05; non-inferiority uses one-sided alpha, default 0.025)"),
  sided: z.enum(["two", "one"]).optional().describe("Test sidedness for means/proportions (default 'two'); non-inferiority is always one-sided"),
  power: z.number().optional().describe("Power in percent, e.g. 80 (default 80)"),
  ratio: z.number().optional().describe("Allocation ratio (default 1). Means/proportions: group 2 : group 1. Non-inferiority: reference : new"),
  attrition: z.number().optional().describe("Expected attrition in percent (default 0)"),
  // means
  diff: z.number().optional().describe("[means] Absolute difference to detect"),
  sd1: z.number().optional().describe("[means] SD group 1 / [noninferiority-means] SD of new group"),
  sd2: z.number().optional().describe("[means] SD group 2 / [noninferiority-means] SD of reference group"),
  // proportions
  p1: z.number().optional().describe("[proportions] Event proportion group 1, as a fraction 0–1 (for non-inferiority binary: new group)"),
  p2: z.number().optional().describe("[proportions] Event proportion group 2, as a fraction 0–1 (for non-inferiority binary: reference group)"),
  // non-inferiority
  endpoint: z.enum(["means", "proportions"]).optional().describe("[noninferiority] Endpoint type (default 'means')"),
  direction: z.enum(["higher", "lower"]).optional().describe("[noninferiority] Which direction is better (default 'higher')"),
  expectedDiff: z.number().optional().describe("[noninferiority-means] Expected difference, new − reference (default 0)"),
  margin: z.number().optional().describe("[noninferiority] Non-inferiority margin (same units as the endpoint; a fraction for binary)")
});

server.registerTool(
  "sample_size",
  {
    title: "Sample size calculator",
    description:
      "Sample size for a two-group comparative study using normal approximations (same formulas as the Meta Workbench web calculator). " +
      "design='means': two independent means (needs diff, sd1, sd2). design='proportions': two independent proportions, pooled-null variance, no continuity correction (needs p1, p2 as fractions). " +
      "design='noninferiority': continuous (sd1/sd2, expectedDiff, margin) or binary (p1/p2, margin) endpoint. " +
      "Returns per-group analysable n, total, and the attrition-adjusted recruitment target.",
    inputSchema: sampleSizeSchema
  },
  async (a) => {
    try {
      const design = a.design;
      const powerPct = a.power ?? 80;
      const ratio = a.ratio ?? 1;
      const attritionPct = a.attrition ?? 0;
      let calc, label, formulaInputs;
      if (design === "means") {
        const alpha = a.alpha ?? 0.05;
        const err = validCommon(alpha, powerPct, ratio, attritionPct);
        if (err) return errorResult(new Error(err));
        if (!(a.diff > 0)) return errorResult(new Error("The difference to detect (diff) must be greater than 0."));
        if (!(a.sd1 > 0) || !(a.sd2 > 0)) return errorResult(new Error("Both standard deviations (sd1, sd2) must be greater than 0."));
        calc = twoMeans({ diff: Math.abs(a.diff), sd1: a.sd1, sd2: a.sd2, alpha, sided: a.sided ?? "two", power: powerPct / 100, ratio, attrition: attritionPct / 100 });
        label = "Two independent means";
        formulaInputs = "n1 = (zα + zpower)² [σ1² + σ2²/r] / Δ²";
      } else if (design === "proportions") {
        const alpha = a.alpha ?? 0.05;
        const err = validCommon(alpha, powerPct, ratio, attritionPct);
        if (err) return errorResult(new Error(err));
        if (!(a.p1 > 0 && a.p1 < 1) || !(a.p2 > 0 && a.p2 < 1)) return errorResult(new Error("Both proportions (p1, p2) must be fractions greater than 0 and less than 1."));
        if (a.p1 === a.p2) return errorResult(new Error("The two proportions are equal, so there is no difference to detect."));
        calc = twoProportions({ p1: a.p1, p2: a.p2, alpha, sided: a.sided ?? "two", power: powerPct / 100, ratio, attrition: attritionPct / 100 });
        label = "Two independent proportions";
        formulaInputs = "n1 = [zα√((1+1/r)·p̄(1−p̄)) + zpower√(p1(1−p1)+p2(1−p2)/r)]² / (p1−p2)²";
      } else {
        const alpha = a.alpha ?? 0.025;
        const err = validCommon(alpha, powerPct, ratio, attritionPct);
        if (err) return errorResult(new Error(err));
        const endpoint = a.endpoint ?? "means";
        const direction = a.direction ?? "higher";
        const o = { alpha, power: powerPct / 100, ratio, attrition: attritionPct / 100, direction, margin: a.margin };
        if (!(a.margin > 0)) return errorResult(new Error("The non-inferiority margin must be greater than 0."));
        if (endpoint === "means") {
          if (!(a.sd1 > 0) || !(a.sd2 > 0)) return errorResult(new Error("Both standard deviations (sd1, sd2) must be greater than 0."));
          o.expectedDiff = a.expectedDiff ?? 0;
          o.varianceTerm = a.sd1 * a.sd1 + a.sd2 * a.sd2 / ratio;
        } else {
          if (!(a.p1 > 0 && a.p1 < 1) || !(a.p2 > 0 && a.p2 < 1)) return errorResult(new Error("Both proportions (p1, p2) must be fractions greater than 0 and less than 1."));
          o.expectedDiff = a.p1 - a.p2;
          o.varianceTerm = a.p1 * (1 - a.p1) + a.p2 * (1 - a.p2) / ratio;
        }
        calc = nonInferiority(o);
        if (!(calc.distance > 0)) return errorResult(new Error("The expected difference is already beyond the non-inferiority boundary. Change the expected difference or the margin — increasing the sample size cannot repair this design."));
        label = "Non-inferiority — " + (endpoint === "means" ? "continuous endpoint" : "binary endpoint");
        formulaInputs = "n(new) = (z(1−α) + zpower)² · varianceTerm / d², d = distance from expected difference to the NI boundary";
      }
      const r = calc.result;
      const text =
        label + ": group 1 n=" + r.n1 + ", group 2 n=" + r.n2 +
        ", total analysable N=" + r.total +
        ", recruitment target after attrition=" + r.adjTotal + " (" + r.adj1 + " + " + r.adj2 + ").\n" +
        "Formula: " + formulaInputs + "\n" +
        "Unrounded n1 = " + r.raw1.toFixed(2) + " (rounded up). Normal approximation — confirm the final number in your primary statistical software.";
      return textResult(text, {
        design, label,
        group1: r.n1, group2: r.n2, totalAnalysable: r.total,
        recruitmentTarget: r.adjTotal, recruitmentGroup1: r.adj1, recruitmentGroup2: r.adj2,
        unroundedGroup1: r.raw1
      });
    } catch (e) { return errorResult(e); }
  }
);

// ---------------------------------------------------------------- forest_plot
const forestSchema = z.object({
  studies: z.array(z.object({
    name: z.string().describe("Study label, e.g. 'Alvarez 2019'"),
    effect: z.number().describe("Effect estimate on the reported scale"),
    ciLower: z.number().describe("Lower bound of the 95% CI"),
    ciUpper: z.number().describe("Upper bound of the 95% CI")
  })).min(1).describe("One entry per study; effect and CI on the reported scale"),
  measure: z.enum(["OR", "RR", "MD", "SMD"]).optional().describe("Effect measure (default 'OR'). OR/RR are pooled on the log scale"),
  model: z.enum(["both", "fixed", "random"]).optional().describe("Which pooled rows to draw (default 'both'). Both pooled estimates are always computed and returned")
});

registerAppTool(
  server,
  "forest_plot",
  {
    title: "Forest plot with DerSimonian–Laird pooling",
    description:
      "Pool study-level effect sizes by inverse variance (fixed-effect and DerSimonian–Laird random-effects, with Q, I², τ²) and draw a forest plot as SVG. " +
      "Standard errors are recovered from the 95% CIs. In MCP Apps hosts an interactive view renders inside the conversation; elsewhere the result carries the same plot as SVG text plus the pooled numbers.",
    inputSchema: forestSchema,
    _meta: { ui: { resourceUri: FOREST_UI_URI } }
  },
  async (a) => {
    try {
      const measure = a.measure ?? "OR";
      const model = a.model ?? "both";
      const M = MEASURES[measure];
      const studies = a.studies.map((s) => ({ name: s.name || "Study", eff: s.effect, lo: s.ciLower, hi: s.ciUpper }));
      for (const s of studies) {
        if (!(s.lo < s.hi)) return errorResult(new Error("Study \"" + s.name + "\": need ciLower < ciUpper."));
        if (M.log && (s.eff <= 0 || s.lo <= 0 || s.hi <= 0)) return errorResult(new Error("Study \"" + s.name + "\": ratio measures need effect and CI bounds > 0."));
      }
      const { svg, result } = renderForestSvg(studies, measure, model);
      const structured = { ...forestStructured(result, measure, model), svg };
      const text = forestSummaryText(result, measure) + "\n\n--- Forest plot (SVG) ---\n" + svg;
      return textResult(text, structured);
    } catch (e) { return errorResult(e); }
  }
);

registerAppResource(
  server,
  "Meta Workbench forest plot view",
  FOREST_UI_URI,
  {
    description: "Interactive forest-plot view for the forest_plot tool (MCP Apps). Renders the tool's structuredContent; degrades to the tool's text/SVG output in hosts without UI support.",
    mimeType: RESOURCE_MIME_TYPE,
    _meta: {
      ui: {
        prefersBorder: true,
        csp: { resourceDomains: [], connectDomains: [] }
      }
    }
  },
  async () => ({
    contents: [{
      uri: FOREST_UI_URI,
      mimeType: RESOURCE_MIME_TYPE,
      text: forestAppHtml,
      _meta: { ui: { prefersBorder: true, csp: { resourceDomains: [], connectDomains: [] } } }
    }]
  })
);

// ---------------------------------------------------------------- rob_traffic_light
const robSchema = z.object({
  studies: z.array(z.object({
    name: z.string().describe("Study label"),
    n: z.number().optional().describe("Sample size (used only for the weighted summary plot)"),
    domains: z.array(z.enum(["Low", "Some", "High", "L", "S", "H"])).length(5).describe("Five RoB 2 domain judgements in order D1..D5: Low / Some (concerns) / High"),
    overall: z.enum(["Low", "Some", "High", "L", "S", "H"]).optional().describe("Optional manual overall judgement; default follows the RoB 2 rule (worst domain wins)")
  })).min(1),
  weighted: z.boolean().optional().describe("Weight the summary plot by sample size N (default false)")
});

server.registerTool(
  "rob_traffic_light",
  {
    title: "RoB 2 traffic-light plot",
    description:
      "Draw a robvis-style RoB 2 traffic-light plot (SVG) from per-domain judgements, plus the summary bar plot (SVG). " +
      "The overall judgement follows the RoB 2 rule unless overridden per study. Studies with 'some concerns' in 2+ domains are flagged † (RoB 2 allows considering an overall High there; never applied silently).",
    inputSchema: robSchema
  },
  async (a) => {
    try {
      const studies = prepareStudies(a.studies);
      const traffic = renderTrafficSvg(studies);
      const summary = renderSummarySvg(studies, a.weighted ?? false);
      const text = robSummaryText(studies, summary.summary) +
        "\n\n--- Traffic-light plot (SVG) ---\n" + traffic.svg +
        "\n\n--- Summary plot (SVG) ---\n" + summary.svg;
      const structured = {
        studies: studies.map((s) => ({
          name: s.name, n: s.n, domains: s.domains,
          overallAuto: s.auto, overall: s.overall, override: s.override, raiseNote: s.raiseNote
        })),
        summaryRows: summary.summary.rows,
        weighted: summary.summary.weighted,
        trafficLightSvg: traffic.svg,
        summaryPlotSvg: summary.svg
      };
      return textResult(text, structured);
    } catch (e) { return errorResult(e); }
  }
);

// ---------------------------------------------------------------- prisma_diagram
const prismaSchema = z.object({
  databases: z.number().int().min(0).describe("Records identified from databases"),
  registers: z.number().int().min(0).optional().describe("Records identified from registers (default 0)"),
  duplicatesRemoved: z.number().int().min(0).optional().describe("Duplicate records removed (default 0)"),
  automationRemoved: z.number().int().min(0).optional().describe("Records marked ineligible by automation tools (default 0)"),
  otherRemoved: z.number().int().min(0).optional().describe("Records removed for other reasons (default 0)"),
  screenExcluded: z.number().int().min(0).optional().describe("Records excluded at title/abstract screening (default 0)"),
  notRetrieved: z.number().int().min(0).optional().describe("Reports not retrieved (default 0)"),
  fullTextExcluded: z.number().int().min(0).optional().describe("Reports excluded at full-text stage (default 0)"),
  exclusionReasons: z.array(z.string()).optional().describe("Full-text exclusion reasons with counts, e.g. 'Wrong population (n = 24)'"),
  studiesIncluded: z.number().int().min(0).describe("Studies included in the review"),
  reportsIncluded: z.number().int().min(0).optional().describe("Reports of included studies (defaults to studiesIncluded)")
});

server.registerTool(
  "prisma_diagram",
  {
    title: "PRISMA 2020 flow diagram",
    description:
      "Draw a PRISMA 2020 flow diagram (SVG) for a review that searched databases and registers. " +
      "Derived counts are computed for you: records screened = identified − removed before screening; reports sought = screened − excluded; reports assessed = sought − not retrieved.",
    inputSchema: prismaSchema
  },
  async (a) => {
    try {
      const counts = {
        databases: a.databases, registers: a.registers ?? 0,
        duplicatesRemoved: a.duplicatesRemoved ?? 0,
        automationRemoved: a.automationRemoved ?? 0,
        otherRemoved: a.otherRemoved ?? 0,
        screenExcluded: a.screenExcluded ?? 0,
        notRetrieved: a.notRetrieved ?? 0,
        fullTextExcluded: a.fullTextExcluded ?? 0,
        exclusionReasons: a.exclusionReasons ?? [],
        studiesIncluded: a.studiesIncluded,
        reportsIncluded: a.reportsIncluded ?? a.studiesIncluded
      };
      const { svg, derived } = renderPrismaSvg(counts);
      const text =
        "PRISMA 2020 flow: identified " + derived.identified +
        " → screened " + derived.screened +
        " → sought " + derived.sought +
        " → assessed " + derived.assessed +
        " → included " + counts.studiesIncluded + " studies (" + counts.reportsIncluded + " reports).\n\n" +
        "--- PRISMA 2020 flow diagram (SVG) ---\n" + svg;
      return textResult(text, { ...derived, studiesIncluded: counts.studiesIncluded, reportsIncluded: counts.reportsIncluded, svg });
    } catch (e) { return errorResult(e); }
  }
);

const transport = new StdioServerTransport();
await server.connect(transport);
console.error("metaworkbench-mcp: listening on stdio");
