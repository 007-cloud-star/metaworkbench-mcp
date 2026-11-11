// Self-test for the Meta Workbench MCP server.
//
// Drives server.mjs over stdio with real JSON-RPC (initialize → tools/list →
// tools/call for all four tools, plus resources/list + resources/read for the
// MCP Apps UI resource), and cross-checks the numbers against an independent
// numpy/scipy implementation (test/py_check.py). SVG outputs are validated as
// well-formed XML rooted at <svg> (test/validate_svg.py).
//
// Run: npm test   (or: node test/selftest.mjs)

import { spawn, execFileSync } from "node:child_process";
import { writeFileSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, "..");

let failures = 0, checks = 0;
function ok(cond, label, extra) {
  checks++;
  if (cond) console.log("PASS  " + label);
  else { failures++; console.log("FAIL  " + label + (extra ? "  — " + extra : "")); }
}
function close(a, b, tol, label) {
  const rel = Math.abs(a - b) / Math.max(1e-12, Math.abs(b));
  ok(isFinite(a) && rel <= tol, label, "got " + a + ", expected " + b + " (rel err " + rel.toExponential(2) + ")");
}

// ------------------------------------------------------------ reference data
const ref = JSON.parse(execFileSync("python3", [join(HERE, "py_check.py")], { encoding: "utf8" }));

// ------------------------------------------------------------ stdio JSON-RPC
const child = spawn("node", [join(ROOT, "server.mjs")], { stdio: ["pipe", "pipe", "pipe"] });
let buf = "";
const waiters = new Map();
child.stderr.on("data", (d) => process.stderr.write("[server] " + d));
child.stdout.on("data", (d) => {
  buf += d.toString("utf8");
  let nl;
  while ((nl = buf.indexOf("\n")) >= 0) {
    const line = buf.slice(0, nl); buf = buf.slice(nl + 1);
    if (!line.trim()) continue;
    let msg;
    try { msg = JSON.parse(line); } catch { continue; }
    if (msg.id != null && waiters.has(msg.id)) { waiters.get(msg.id)(msg); waiters.delete(msg.id); }
  }
});
let nextId = 0;
function rpc(method, params) {
  return new Promise((resolve, reject) => {
    const id = ++nextId;
    waiters.set(id, (msg) => msg.error ? reject(new Error(method + ": " + JSON.stringify(msg.error))) : resolve(msg.result));
    child.stdin.write(JSON.stringify({ jsonrpc: "2.0", id, method, params }) + "\n");
    setTimeout(() => { if (waiters.has(id)) { waiters.delete(id); reject(new Error(method + ": timeout")); } }, 15000);
  });
}
function notify(method, params) {
  child.stdin.write(JSON.stringify({ jsonrpc: "2.0", method, params }) + "\n");
}

// ------------------------------------------------------------ session
const init = await rpc("initialize", {
  protocolVersion: "2025-06-18",
  capabilities: { extensions: { "io.modelcontextprotocol/ui": { mimeTypes: ["text/html;profile=mcp-app"] } } },
  clientInfo: { name: "metaworkbench-selftest", version: "0.1.0" }
});
ok(init && init.serverInfo && init.serverInfo.name === "metaworkbench", "initialize returns serverInfo metaworkbench");
ok(!!(init.capabilities && init.capabilities.extensions && init.capabilities.extensions["io.modelcontextprotocol/ui"]),
   "server declares the io.modelcontextprotocol/ui extension capability");
notify("notifications/initialized");

const tools = (await rpc("tools/list", {})).tools;
const names = tools.map((t) => t.name).sort();
ok(JSON.stringify(names) === JSON.stringify(["forest_plot", "prisma_diagram", "rob_traffic_light", "sample_size"]),
   "tools/list exposes exactly the 4 workbench tools", names.join(","));
const forestTool = tools.find((t) => t.name === "forest_plot");
const toolMetaUri = forestTool && forestTool._meta && ((forestTool._meta.ui && forestTool._meta.ui.resourceUri) || forestTool._meta["ui/resourceUri"]);
ok(toolMetaUri === "ui://metaworkbench/forest-plot", "forest_plot tool carries the MCP Apps UI resourceUri in _meta", String(toolMetaUri));

const resources = (await rpc("resources/list", {})).resources || [];
const uiRes = resources.find((r) => r.uri === "ui://metaworkbench/forest-plot");
ok(!!uiRes, "resources/list includes ui://metaworkbench/forest-plot");
ok(uiRes && uiRes.mimeType === "text/html;profile=mcp-app", "UI resource MIME type is text/html;profile=mcp-app", uiRes && uiRes.mimeType);
const read = await rpc("resources/read", { uri: "ui://metaworkbench/forest-plot" });
const html = read && read.contents && read.contents[0] && read.contents[0].text || "";
ok(html.includes("ui/initialize") && html.includes("ui/notifications/tool-result"),
   "UI resource HTML implements the MCP Apps bridge (ui/initialize + tool-result handler)");
ok(read.contents[0].mimeType === "text/html;profile=mcp-app", "resources/read returns the app MIME type");

async function call(name, args) {
  const r = await rpc("tools/call", { name, arguments: args });
  if (r.isError) throw new Error(name + " returned isError: " + (r.content && r.content[0] && r.content[0].text));
  return r;
}
const svgDir = mkdtempSync(join(tmpdir(), "mwb-svg-"));
function saveSvg(tag, svg) {
  const p = join(svgDir, tag + ".svg");
  writeFileSync(p, svg);
  return p;
}
const svgFiles = [];

// ------------------------------------------------------------ sample_size
{
  const r = await call("sample_size", { design: "means", diff: 5, sd1: 10, sd2: 10 });
  const s = r.structuredContent, e = ref.means_case;
  ok(s.group1 === e.n1 && s.group2 === e.n2 && s.totalAnalysable === e.total,
     "sample_size means case: 63 + 63 = 126 (textbook case, matches scipy)", JSON.stringify(s));
  close(s.unroundedGroup1, e.raw1, 1e-9, "sample_size means unrounded n matches scipy");

  const r2 = await call("sample_size", { design: "proportions", p1: 0.2, p2: 0.1, attrition: 10 });
  const s2 = r2.structuredContent, e2 = ref.props_case;
  ok(s2.group1 === e2.n1 && s2.recruitmentTarget === e2.adjTotal,
     "sample_size proportions case: 199/group, 444 total after 10% attrition", JSON.stringify(s2));

  const r3 = await call("sample_size", { design: "noninferiority", endpoint: "proportions", direction: "lower", p1: 0.12, p2: 0.10, margin: 0.05 });
  const s3 = r3.structuredContent, e3 = ref.ni_binary_case;
  ok(s3.group1 === e3.n1 && s3.totalAnalysable === e3.total,
     "sample_size non-inferiority binary case: 1706/group (matches scipy)", JSON.stringify(s3));

  const bad = await rpc("tools/call", { name: "sample_size", arguments: { design: "means", diff: -1, sd1: 10, sd2: 10 } });
  ok(bad.isError === true, "sample_size rejects a negative difference with isError");
}

// ------------------------------------------------------------ forest_plot
const TOY = [
  { name: "Toy A 2020", effect: 0.70, ciLower: 0.50, ciUpper: 0.98 },
  { name: "Toy B 2021", effect: 0.85, ciLower: 0.60, ciUpper: 1.20 },
  { name: "Toy C 2022", effect: 0.60, ciLower: 0.35, ciUpper: 1.03 },
  { name: "Toy D 2023", effect: 1.10, ciLower: 0.75, ciUpper: 1.61 }
];
{
  const r = await call("forest_plot", { studies: TOY, measure: "OR" });
  const s = r.structuredContent, e = ref.toy_pool;
  close(s.fixedEffect.estimate, e.fixed.est, 1e-9, "forest toy fixed-effect estimate matches scipy DL implementation");
  close(s.fixedEffect.ciLower, e.fixed.lo, 1e-9, "forest toy fixed-effect CI lower matches");
  close(s.randomEffectsDL.estimate, e.random.est, 1e-9, "forest toy random-effects (DL) estimate matches");
  close(s.randomEffectsDL.ciUpper, e.random.hi, 1e-9, "forest toy random-effects CI upper matches");
  close(s.heterogeneity.Q, e.Q, 1e-9, "forest toy Q matches");
  close(s.heterogeneity.iSquaredPct, e.I2, 1e-9, "forest toy I² matches");
  close(s.heterogeneity.tauSquared, e.tau2, 1e-9, "forest toy τ² matches");
  close(s.heterogeneity.pValue, e.pQ, 1e-6, "forest toy Q p-value matches scipy chi-square sf");
  ok(typeof s.svg === "string" && s.svg.length > 1500 && s.svg.startsWith("<svg"), "forest SVG present in structuredContent (" + (s.svg || "").length + " chars)");
  svgFiles.push(saveSvg("forest-toy", s.svg));
  const txt = r.content[0].text;
  ok(txt.includes("DerSimonian") && txt.includes(s.svg), "forest text content carries the summary + the same SVG");

  // Demo dataset from the web tool — second, larger cross-check.
  const DEMO = [
    { name: "Alvarez 2019", effect: 0.55, ciLower: 0.38, ciUpper: 0.80 },
    { name: "Chen 2020", effect: 0.92, ciLower: 0.68, ciUpper: 1.24 },
    { name: "Okafor 2021", effect: 0.64, ciLower: 0.41, ciUpper: 0.99 },
    { name: "Novak 2018", effect: 1.08, ciLower: 0.79, ciUpper: 1.48 },
    { name: "Singh 2022", effect: 0.78, ciLower: 0.60, ciUpper: 1.01 },
    { name: "Meyer 2023", effect: 0.83, ciLower: 0.66, ciUpper: 1.04 }
  ];
  const rd = await call("forest_plot", { studies: DEMO, measure: "OR" });
  const sd = rd.structuredContent, ed = ref.demo_pool;
  close(sd.randomEffectsDL.estimate, ed.random.est, 1e-9, "forest demo-dataset DL estimate matches scipy");
  close(sd.heterogeneity.iSquaredPct, ed.I2, 1e-9, "forest demo-dataset I² matches scipy");
  svgFiles.push(saveSvg("forest-demo", sd.svg));
}

// ------------------------------------------------------------ rob_traffic_light
{
  const r = await call("rob_traffic_light", {
    studies: [
      { name: "Clean 2020", n: 240, domains: ["Low", "Low", "Low", "Low", "Low"] },
      { name: "Mixed 2021", n: 180, domains: ["Low", "Some", "Low", "Some", "Low"] },
      { name: "Risky 2022", n: 95, domains: ["Low", "High", "Some", "Low", "Low"] },
      { name: "Override 2023", domains: ["Some", "Low", "Low", "Low", "Low"], overall: "Low" }
    ],
    weighted: true
  });
  const s = r.structuredContent;
  ok(s.studies[0].overall === "L", "RoB: all-Low study → overall Low");
  ok(s.studies[1].overall === "S" && s.studies[1].raiseNote === true, "RoB: two Some-concerns domains → overall Some + † flag");
  ok(s.studies[2].overall === "H", "RoB: any High domain → overall High");
  ok(s.studies[3].overall === "L" && s.studies[3].override === "L", "RoB: manual overall override honoured");
  ok(s.weighted === true, "RoB: weighted summary engaged when N present");
  ok(s.trafficLightSvg.length > 1500 && s.summaryPlotSvg.length > 1500, "RoB: both SVGs present");
  svgFiles.push(saveSvg("rob-traffic", s.trafficLightSvg));
  svgFiles.push(saveSvg("rob-summary", s.summaryPlotSvg));
}

// ------------------------------------------------------------ prisma_diagram
{
  const r = await call("prisma_diagram", {
    databases: 1450, registers: 50, duplicatesRemoved: 300, automationRemoved: 0,
    otherRemoved: 25, screenExcluded: 1050, notRetrieved: 15, fullTextExcluded: 84,
    exclusionReasons: ["Wrong population (n = 31)", "No usable outcome data (n = 53)"],
    studiesIncluded: 26, reportsIncluded: 27
  });
  const s = r.structuredContent;
  ok(s.identified === 1500 && s.removedBeforeScreening === 325 && s.screened === 1175 &&
     s.sought === 125 && s.assessed === 110,
     "PRISMA derived counts: 1500 → 1175 → 125 → 110", JSON.stringify(s));
  ok(s.svg.length > 1500 && s.svg.includes("Reports assessed for eligibility"), "PRISMA SVG present with phase boxes");
  svgFiles.push(saveSvg("prisma", s.svg));
}

// ------------------------------------------------------------ SVG validity
{
  const out = JSON.parse(execFileSync("python3", [join(HERE, "validate_svg.py"), ...svgFiles], { encoding: "utf8" }));
  for (const f of svgFiles) ok(out[f] === true, "valid well-formed SVG: " + f.split("/").pop());
}

child.kill();
console.log("\n" + (checks - failures) + "/" + checks + " checks passed" + (failures ? " — " + failures + " FAILED" : ""));
process.exit(failures ? 1 : 0);
