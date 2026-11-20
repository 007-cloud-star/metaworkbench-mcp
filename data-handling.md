# Data handling — Meta Workbench MCP server

Short statement of how the Meta Workbench MCP server (`metaworkbench-mcp`,
version 0.1.0) handles data, as implemented in the published code.

## Local computation only

The server runs on the user's own machine as a local stdio process, started
by the user's own AI client (for example Claude Desktop or Claude Code). All
four tools — sample-size calculation, forest plot (fixed-effect and
DerSimonian–Laird pooling), RoB 2 traffic light, and PRISMA 2020 diagram —
perform their computation locally in that process and return text, structured
numbers, and SVG to the client.

## No upload, no server-side retention

- The server code makes **no network calls of its own**: it opens no
  outbound connections, calls no API, and sends no telemetry.
- There is **no developer-operated server** in this architecture, so nothing
  is uploaded to, stored on, or retained by the developer. Inputs exist only
  in the memory of the local process for the duration of the call.
- The server has **no accounts, no authentication, and no logging of user
  data** to disk.

## No sub-processors

The developer engages **no third-party sub-processors** for this server, and
the server itself transmits data to none.

## The client side is the user's

The user invokes the tools through their own AI client and their own AI
provider account. Whatever the user types into that client — including any
values they choose to pass to these tools — is handled by the client and the
user's AI provider under that provider's terms, and any AI usage costs are
the user's, billed by their own provider. The developer receives none of it.
Users should therefore only enter data they are comfortable sharing with
their own AI provider; the tools are designed for aggregate research data
(study-level effects, counts, and judgements), not for patient-level or
personally identifiable data.

## Scope note

This statement covers the MCP server and its four tools. The repository also
contains an optional, separate screening client script (`carbon-client.mjs`)
that is **not** part of the MCP server: it does nothing unless the user runs
it themselves with their own Google API key, in which case records are sent
to Google's API under the user's own account and terms. It is excluded from
any marketplace listing of the server.

---

*Consistency check (2026-11-20): verified against the repository README and
source — the server and its `lib/` modules contain no outbound network calls
(only SVG namespace strings); README confirms local stdio operation, Node
≥ 18, and that claude.ai use would require a separately deployed remote
endpoint that does not exist in this version.*
