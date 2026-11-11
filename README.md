# Meta Workbench — MCP server (+ MCP Apps UI) and Gemini 4 Carbon screening client

Built 2026-11-11, applying two things to the Meta Workbench line:

1. **Claude MCP Apps** — the four web tools (https://007-cloud-star.github.io/metaworkbench/)
   are now also an MCP server. The `forest_plot` tool is bound to an MCP Apps UI
   resource that renders an interactive forest plot inside Claude; hosts without
   MCP Apps support get the identical plot as SVG text plus structured numbers,
   so nothing depends on the UI.
2. **Gemini 4 Carbon** — a ready-to-run client + long-horizon screening task
   template (`carbon-client.mjs`). Code only: **no live API call has been made**
   (see "Carbon status" below).

The existing web site files in `../metaworkbench/` are untouched; this is a
sibling folder.

## What was built

```
metaworkbench-mcp/
├── server.mjs            # MCP server (stdio) — official @modelcontextprotocol/sdk
├── lib/
│   ├── sampleSize.mjs    # ported from sample-size-calculator (verbatim cores)
│   ├── forest.mjs        # ported from forest-plot-generator (DL pooling + SVG)
│   ├── rob.mjs           # ported from rob-traffic-light-generator (RoB 2 + SVG)
│   └── prisma.mjs        # ported from prisma-flow-diagram-generator (SVG)
├── app/
│   └── forest-plot.html  # MCP Apps UI resource (ui://metaworkbench/forest-plot)
├── carbon-client.mjs     # Gemini 4 Carbon screening client + task template
└── test/
    ├── selftest.mjs      # stdio end-to-end test (drives the real server)
    ├── py_check.py       # independent numpy/scipy reference computations
    └── validate_svg.py   # XML well-formedness check for the SVG outputs
```

Tools exposed:

| Tool | Input | Returns |
|---|---|---|
| `sample_size` | design (`means` / `proportions` / `noninferiority`) + the usual α, power, ratio, attrition | per-group n, total, attrition-adjusted recruitment target (text + structured) |
| `forest_plot` | studies `[{name, effect, ciLower, ciUpper}]`, measure OR/RR/MD/SMD, model | fixed-effect + DerSimonian–Laird pooling, Q / I² / τ², forest-plot SVG; **MCP Apps UI** in supporting hosts |
| `rob_traffic_light` | studies with 5 RoB 2 domain judgements (+ optional N, overall override), `weighted` flag | robvis-style traffic-light SVG + summary bar SVG; overall per the RoB 2 rule, 2+-domain "some concerns" flagged † |
| `prisma_diagram` | identification/screening counts (+ exclusion reasons) | PRISMA 2020 flow diagram SVG; derived counts computed for you |

MCP Apps wiring (per the extension spec, `io.modelcontextprotocol/ui`):

- the server declares the extension capability with MIME type `text/html;profile=mcp-app`;
- `forest_plot` is registered with `_meta.ui.resourceUri = "ui://metaworkbench/forest-plot"`
  (the legacy `_meta["ui/resourceUri"]` key is populated too, by the ext-apps SDK);
- the HTML is served via `resources/read` with a restrictive CSP (no external
  domains) and implements the app bridge: it sends `ui/initialize`, then renders
  each `ui/notifications/tool-result`'s `structuredContent` with its own
  renderer. Open `app/forest-plot.html?demo=1` in a browser to preview it with
  the web tool's demo dataset.

## Register the server

**Claude Desktop** (macOS/Windows) — add to `claude_desktop_config.json`
(Settings → Developer → Edit Config), adjusting the path to where this folder lives:

```json
{
  "mcpServers": {
    "metaworkbench": {
      "command": "node",
      "args": ["/home/hatch/workspace/indie-site/metaworkbench-mcp/server.mjs"]
    }
  }
}
```

Then restart Claude Desktop. First run `npm install` in this folder once
(dependencies: `@modelcontextprotocol/sdk`, `@modelcontextprotocol/ext-apps`, `zod`).

**Claude Code**:

```bash
claude mcp add metaworkbench -- node /home/hatch/workspace/indie-site/metaworkbench-mcp/server.mjs
```

**claude.ai** — custom connectors on claude.ai require a *remote* MCP server
reachable over HTTPS; a local stdio server like this one cannot be pasted in
directly. Use it through Claude Desktop (same account), or deploy this server
behind an HTTPS/streamable-HTTP endpoint later if a web-side connector is wanted.

## Test results

`npm test` ( = `node test/selftest.mjs`) drives the server over stdio —
initialize, tools/list, tools/call for all four tools, resources/list +
resources/read — and cross-checks the numbers against an independent
numpy/scipy implementation (`test/py_check.py`); all five SVG outputs are
parsed as XML to confirm they are valid, well-formed SVG.

**Result: 38/38 checks passed** (2026-11-11). Highlights:

- Sample size, textbook cases: means Δ=5, σ=10, 80% power → **63/group**;
  proportions 20% vs 10% → **199/group** (444 total after 10% attrition);
  non-inferiority binary case → **1706/group**. All identical to scipy.
- DL pooling, 4-study toy set: fixed OR 0.8153 [0.6736, 0.9868],
  random-effects OR 0.8118 [0.6409, 1.0283], Q = 4.446, I² = 32.5%, τ² = 0.01889
  — every value matches the scipy implementation to ≤1e-9 relative error
  (Q p-value to 1e-6). The web tool's 6-study demo dataset also matches
  (DL OR 0.8020, I² = 46.2%).
- RoB 2 rules verified: any High → overall High; two "some concerns" → Some + †
  flag; override honoured; weighted summary engages when N is supplied.
- PRISMA derived counts verified: 1500 identified → 1175 screened → 125 sought
  → 110 assessed.
- MCP Apps: `initialize` shows the server declaring the UI extension;
  `forest_plot`'s `_meta` carries the resource URI; `resources/read` returns
  the app HTML with the correct MIME type.

## Carbon status (Gemini 4 Carbon)

- **No live call was made, and no money was spent.** The Gemini key available
  to this sandbox returns HTTP 403; Carbon is a **paid-tier-only** model
  (no free tier), so a real run needs a billing-enabled AI Studio / Google
  Cloud API key in `GEMINI_API_KEY`.
- `carbon-client.mjs` is complete and dry-run-verified: model from env
  `GEMINI_MODEL` (default `gemini-4-carbon`, automatic one-time fallback to
  `gemini-4-argon` on a 404), batches of 25 abstracts per call, structured
  JSON decisions (`include` / `exclude` / `unclear` + reason + PICO match),
  token-usage and cost reporting, and `SCREENING_TASK_TEMPLATE` — the
  long-horizon agent task for title/abstract screening, designed as a
  *second-reviewer draft for human reconciliation*, not a replacement for
  dual human screening.
- Try it without a key: `node carbon-client.mjs --print-template` or
  `node carbon-client.mjs --dry-run records.json`.
- **Pricing window:** Carbon's introductory price is **$2 / 1M input +
  $10 / 1M output until 2026-11-30**, then $4 / $20.
- **Estimated cost of one screening run** (assumptions: 5,000 records,
  ~280 tokens per title+abstract, ~60 output tokens per decision, criteria
  overhead included): ≈ 1.6M input + 0.3M output tokens → **≈ $6 at intro
  pricing, ≈ $12 after 2026-11-30**. A 10,000-record search roughly doubles
  that (≈ $12 intro / ≈ $25 regular). Cheap relative to reviewer hours —
  the real gate is the paid key, not the run cost.
