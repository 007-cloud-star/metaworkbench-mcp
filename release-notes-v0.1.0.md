# Release notes — metaworkbench-mcp v0.1.0 (draft)

**Version:** 0.1.0 · **Status:** initial public release of the Meta Workbench
tools as a local MCP server · **Repository:**
https://github.com/007-cloud-star/metaworkbench-mcp

## What it is

The four Meta Workbench web tools, packaged as an MCP server built on the
official `@modelcontextprotocol/sdk` (stdio transport), so any MCP-capable AI
client can call them directly. The forest plot is additionally bound to an
MCP Apps UI resource that renders an interactive plot inside supporting
hosts; hosts without MCP Apps support receive the identical plot as SVG text
plus structured numbers.

## The four tools

| Tool | What it does |
|---|---|
| `sample_size` | Sample-size calculation for three designs — comparing means, comparing proportions, and non-inferiority — with α, power, allocation ratio, and attrition adjustment; returns per-group n, total, and the attrition-adjusted recruitment target. |
| `forest_plot` | Forest plots from study-level effects and confidence intervals (OR / RR / MD / SMD): fixed-effect and DerSimonian–Laird random-effects pooling, Q / I² / τ², SVG output, plus the MCP Apps interactive UI in supporting hosts. |
| `rob_traffic_light` | RoB 2 traffic-light plots in robvis style, with the weighted summary bar; overall judgements follow the RoB 2 rule (any High → High; two or more "some concerns" domains flagged †), with optional overall override. |
| `prisma_diagram` | PRISMA 2020 flow diagrams as SVG from identification/screening counts; derived counts (screened, sought, assessed) are computed automatically, with full-text exclusion reasons supported. |

## Verification

- End-to-end self-test over stdio (`npm test`, driving the real server:
  initialize → tools/list → tools/call for all four tools → resources):
  **38/38 checks passed**.
- Numerical results cross-checked against an independent numpy/scipy
  reference implementation (agreement to ≤1e-9 relative error on pooled
  estimates; Q p-value to 1e-6).
- All five SVG outputs parsed and confirmed well-formed XML.

## Requirements & running locally

- Node.js ≥ 18.
- Install once with `npm install` (dependencies: `@modelcontextprotocol/sdk`,
  `@modelcontextprotocol/ext-apps`, `zod`), then register the server with
  your client, e.g. Claude Desktop via `claude_desktop_config.json` or
  Claude Code via `claude mcp add` (see README for exact snippets).
- Runs entirely locally: no account, no API key, and no network access are
  required for the four tools.
- Note: claude.ai custom connectors require a remote HTTPS MCP server; this
  local stdio build is used through desktop/local clients.

## Known scope limits of 0.1.0

- Local stdio only — no hosted/remote endpoint yet.
- The repository's optional Gemini screening client (`carbon-client.mjs`) is
  code-only in this release: no live API call has been made with it, and it
  is not part of the MCP server.
