#!/usr/bin/env node
// Gemini 4 Carbon client for long-horizon meta-analysis screening tasks.
//
// STATUS (2026-11-11): written and syntax-checked only — NO live API call has
// been made from this environment. The saved Gemini key available to the
// sandbox returns HTTP 403, and Carbon is a paid-tier model, so a live run
// needs LEI's own billing-enabled AI Studio / Google Cloud API key.
//
// Model: env GEMINI_MODEL, default "gemini-4-carbon"; if the API answers
// 404 (model not enabled on the key's project), the client retries once with
// the fallback "gemini-4-argon". Intro pricing for Carbon runs to
// 2026-11-30 ($2 / 1M input tokens, $10 / 1M output); afterwards $4 / $20.
//
// Usage:
//   node carbon-client.mjs --print-template          # show the agent task template (no network)
//   node carbon-client.mjs --dry-run records.json    # build request payloads, print them, no network
//   GEMINI_API_KEY=... node carbon-client.mjs --live records.json   # real run (PAID)
//
// records.json format: [{ "id": "PMID:12345", "title": "...", "abstract": "..." }, ...]
// Output (live): decisions JSON on stdout + a usage/cost summary on stderr.

import { readFileSync } from "node:fs";

const API_HOST = "https://generativelanguage.googleapis.com";
const MODEL = process.env.GEMINI_MODEL || "gemini-4-carbon";
const FALLBACK_MODEL = "gemini-4-argon";
const API_KEY = process.env.GEMINI_API_KEY || "";
const BATCH_SIZE = 25;               // abstracts per generateContent call
const PRICE = {                      // USD per 1M tokens, gemini-4-carbon
  intro:   { input: 2,  output: 10, until: "2026-11-30" },
  regular: { input: 4,  output: 20 }
};

// ---------------------------------------------------------------------------
// Long-horizon agent task template: title/abstract screening for a systematic
// review. This is the reusable instruction block — the "agent task" a Carbon
// run executes batch by batch, with state carried between calls by the client
// (seen ids, running counts), not by the model.
// ---------------------------------------------------------------------------
export const SCREENING_TASK_TEMPLATE = {
  task: "title_abstract_screening",
  version: "1.0",
  goal:
    "Screen every record in the input set against the review's eligibility criteria and return " +
    "one structured decision per record. Work through the set in batches until it is exhausted; " +
    "never invent a record, never skip one, and when a record is ambiguous mark it 'unclear' " +
    "rather than guessing — unclear records go to full-text retrieval, they are not exclusions.",
  inputs: {
    criteria: {
      population: "<define, e.g. adults with acute ischaemic stroke>",
      intervention: "<define, e.g. edaravone monotherapy, any dose/route>",
      comparator: "<define, e.g. placebo or standard care>",
      outcomes: "<define, e.g. functional outcome (mRS) at ~90 days>",
      studyDesigns: "<define, e.g. randomised controlled trials only>",
      excludeIf: ["not a primary study (reviews, editorials, protocols without results)",
                  "conference abstract with no extractable data",
                  "wrong population / intervention / design on the face of the abstract"]
    },
    records: "[{ id, title, abstract }]"
  },
  decisionSchema: {
    type: "object",
    properties: {
      decisions: {
        type: "array",
        items: {
          type: "object",
          properties: {
            id: { type: "string" },
            decision: { type: "string", enum: ["include", "exclude", "unclear"] },
            reason: { type: "string", description: "One short clause naming the criterion that decided it" },
            picoMatch: {
              type: "object",
              properties: {
                population: { type: "boolean" },
                intervention: { type: "boolean" },
                design: { type: "boolean" }
              },
              required: ["population", "intervention", "design"]
            }
          },
          required: ["id", "decision", "reason"]
        }
      }
    },
    required: ["decisions"]
  },
  stoppingRules: [
    "Stop when every input id has exactly one decision.",
    "If a batch response omits ids, re-ask for the missing ids once; if still missing, mark them 'unclear' with reason 'no model decision returned'.",
    "Never let the model's include/exclude counts change the criteria mid-run."
  ],
  humanCheckpoint:
    "A human reviewer screens in parallel (dual independent screening). The model's output is a " +
    "second-reviewer draft for reconciliation, not a replacement for human screening."
};

function screeningSystemPrompt(criteria) {
  return [
    "You are the second reviewer in a systematic review, screening titles and abstracts.",
    "Eligibility criteria (PICOS):",
    "- Population: " + criteria.population,
    "- Intervention: " + criteria.intervention,
    "- Comparator: " + criteria.comparator,
    "- Outcomes: " + criteria.outcomes,
    "- Study designs: " + criteria.studyDesigns,
    "Exclude only when the abstract clearly violates a criterion (" +
      SCREENING_TASK_TEMPLATE.inputs.criteria.excludeIf.join("; ") + ").",
    "If the abstract is ambiguous or silent on a criterion, decide 'unclear' — unclear goes to",
    "full-text retrieval. Return exactly one decision per record id, as JSON matching the schema.",
    "Do not add commentary outside the JSON."
  ].join("\n");
}

function buildRequest(recordsBatch, criteria, model) {
  const listing = recordsBatch.map((r, i) =>
    "### Record " + (i + 1) + " — id: " + r.id + "\nTitle: " + r.title + "\nAbstract: " + (r.abstract || "(none)")
  ).join("\n\n");
  return {
    url: API_HOST + "/v1beta/models/" + model + ":generateContent",
    body: {
      systemInstruction: { parts: [{ text: screeningSystemPrompt(criteria) }] },
      contents: [{ role: "user", parts: [{ text: "Screen these " + recordsBatch.length + " records:\n\n" + listing }] }],
      generationConfig: {
        temperature: 0,
        responseMimeType: "application/json",
        responseSchema: SCREENING_TASK_TEMPLATE.decisionSchema
      }
    }
  };
}

async function generateContent(model, body) {
  const res = await fetch(API_HOST + "/v1beta/models/" + model + ":generateContent", {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-goog-api-key": API_KEY },
    body: JSON.stringify(body)
  });
  if (res.status === 404 && model === MODEL && MODEL !== FALLBACK_MODEL) {
    process.stderr.write("[carbon] model " + model + " not found for this key; retrying with " + FALLBACK_MODEL + "\n");
    return generateContent(FALLBACK_MODEL, body);
  }
  if (!res.ok) throw new Error("Gemini API HTTP " + res.status + ": " + (await res.text()).slice(0, 400));
  return res.json();
}

// Screen a full record set. Returns { decisions, usage } where usage carries
// token totals for the cost report. dryRun=true builds payloads only.
export async function screenRecords(records, criteria, { dryRun = false } = {}) {
  const decisions = [];
  const usage = { calls: 0, promptTokens: 0, outputTokens: 0, payloads: [] };
  for (let i = 0; i < records.length; i += BATCH_SIZE) {
    const batch = records.slice(i, i + BATCH_SIZE);
    const { body } = buildRequest(batch, criteria, MODEL);
    usage.calls++;
    if (dryRun) { usage.payloads.push(body); continue; }
    const resp = await generateContent(MODEL, body);
    const u = resp.usageMetadata || {};
    usage.promptTokens += u.promptTokenCount || 0;
    usage.outputTokens += u.candidatesTokenCount || 0;
    const text = resp.candidates && resp.candidates[0] && resp.candidates[0].content &&
      resp.candidates[0].content.parts.map((p) => p.text || "").join("");
    const parsed = JSON.parse(text);
    const got = new Map((parsed.decisions || []).map((d) => [d.id, d]));
    for (const r of batch) {
      decisions.push(got.get(r.id) || { id: r.id, decision: "unclear", reason: "no model decision returned" });
    }
  }
  return { decisions, usage };
}

export function estimateCostUSD(promptTokens, outputTokens, when = new Date()) {
  const tier = when <= new Date(PRICE.intro.until + "T23:59:59Z") ? PRICE.intro : PRICE.regular;
  return (promptTokens * tier.input + outputTokens * tier.output) / 1e6;
}

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------
const args = process.argv.slice(2);
if (args.includes("--print-template")) {
  console.log(JSON.stringify(SCREENING_TASK_TEMPLATE, null, 2));
} else if (args.includes("--dry-run") || args.includes("--live")) {
  const live = args.includes("--live");
  const file = args.find((a) => !a.startsWith("--"));
  if (!file) { console.error("usage: carbon-client.mjs [--dry-run|--live] records.json"); process.exit(2); }
  if (live && !API_KEY) { console.error("GEMINI_API_KEY is not set — refusing to start a live (paid) run."); process.exit(2); }
  const records = JSON.parse(readFileSync(file, "utf8"));
  const criteria = SCREENING_TASK_TEMPLATE.inputs.criteria; // replace placeholders per review
  const { decisions, usage } = await screenRecords(records, criteria, { dryRun: !live });
  if (!live) {
    console.log(JSON.stringify({ mode: "dry-run", model: MODEL, batches: usage.calls, firstPayload: usage.payloads[0] || null }, null, 2));
  } else {
    console.log(JSON.stringify(decisions, null, 2));
    console.error("[carbon] calls=" + usage.calls + " promptTokens=" + usage.promptTokens +
      " outputTokens=" + usage.outputTokens +
      " est. cost ≈ $" + estimateCostUSD(usage.promptTokens, usage.outputTokens).toFixed(2) +
      " (intro pricing if before " + PRICE.intro.until + ")");
  }
} else {
  console.log("carbon-client.mjs — Gemini 4 Carbon screening client (no live call made).");
  console.log("  --print-template         print the screening agent task template");
  console.log("  --dry-run records.json   build request payloads only (no network, no cost)");
  console.log("  --live records.json      real run — requires GEMINI_API_KEY, PAID");
}
