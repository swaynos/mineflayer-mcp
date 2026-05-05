#!/usr/bin/env node
import path from "node:path"
import { EPOCH5_ROOT, listJsonFiles, loadEnv, parseArgs, readJson, tsStamp, writeJson } from "./epoch5-lib.js"

function firstTool(trace = []) {
  const call = trace.find((item) => item?.type === "mcp_call")
  return call?.name || null
}

export function scoreDry(run) {
  const picked = firstTool(run.trace)
  const selectedCorrectly = run.expected_first_tool ? picked === run.expected_first_tool : picked !== null
  return {
    run_id: run.id,
    epic: run.epic,
    style: run.style,
    selected_tool: picked,
    expected_tool: run.expected_first_tool,
    tool_selection_correct: selectedCorrectly,
    argument_correct: picked ? true : false,
    latency_ms: run.durationMs,
    score: selectedCorrectly ? 1 : 0,
    rationale: selectedCorrectly ? "First tool matches expected intent." : "First tool does not match expected intent.",
  }
}

function firstText(output) {
  if (!Array.isArray(output)) return ""
  for (const item of output) {
    if (item?.type === "message" && Array.isArray(item.content)) {
      for (const block of item.content) {
        if (block?.type === "output_text" && typeof block.text === "string") return block.text
        if (block?.type === "text" && typeof block.text === "string") return block.text
      }
    }
    if (item?.type !== "text") continue
    if (Array.isArray(item.content)) {
      for (const block of item.content) {
        if (block?.type === "text" && typeof block.text === "string") return block.text
      }
    }
    if (typeof item?.text === "string") return item.text
  }
  return ""
}

export function buildJudgePrompt(run) {
  const trace = Array.isArray(run.trace) ? run.trace : []
  return [
    "You are a strict Minecraft MCP trace judge.",
    "Return ONLY valid JSON matching this schema:",
    '{"tool_selection_correct":boolean,"argument_correct":boolean,"intent_fidelity":number,"rationale":string}',
    "Rules:",
    "- tool_selection_correct: first tool call aligns with prompt intent.",
    "- argument_correct: first call args are semantically valid for intent.",
    "- intent_fidelity: integer 0-100 representing overall fidelity.",
    "- rationale: concise explanation (<40 words).",
    "---",
    `Prompt: ${run.prompt}`,
    `Expected first tool: ${run.expected_first_tool || "(none specified)"}`,
    `Trace: ${JSON.stringify(trace)}`,
  ].join("\n")
}

export function parseJudgeJson(text) {
  const fenced = text.match(/```json\s*([\s\S]*?)```/i)
  const payload = fenced ? fenced[1] : text
  const parsed = JSON.parse(payload)
  if (typeof parsed.tool_selection_correct !== "boolean") throw new Error("judge missing tool_selection_correct boolean")
  if (typeof parsed.argument_correct !== "boolean") throw new Error("judge missing argument_correct boolean")
  const fidelity = Number(parsed.intent_fidelity)
  if (!Number.isInteger(fidelity) || fidelity < 0 || fidelity > 100) {
    throw new Error("judge intent_fidelity must be integer 0-100")
  }
  return {
    tool_selection_correct: parsed.tool_selection_correct,
    argument_correct: parsed.argument_correct,
    intent_fidelity: fidelity,
    rationale: typeof parsed.rationale === "string" ? parsed.rationale : "",
  }
}

export async function judgeWithAI(run, options = {}) {
  const apiKey = process.env.OPENAI_API_KEY || process.env.OPENAI_TOKEN
  if (!apiKey) throw new Error("OPENAI_API_KEY is required")
  const model = process.env.OPENAI_JUDGE_MODEL || "gpt-5"
  const baseUrl = options.baseUrl || process.env.OPENAI_BASE_URL || "https://api.openai.com"
  const fetchImpl = options.fetchImpl || fetch
  const payload = {
    model,
    input: buildJudgePrompt(run),
    reasoning: { effort: "low" },
  }
  const response = await fetchImpl(`${baseUrl.replace(/\/$/, "")}/v1/responses`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "content-type": "application/json",
    },
    body: JSON.stringify(payload),
  })
  const text = await response.text()
  const json = JSON.parse(text)
  if (!response.ok) throw new Error(`OpenAI API error: ${JSON.stringify(json)}`)
  const judged = parseJudgeJson(firstText(json.output))
  return {
    ...judged,
    judge_model: model,
    judge_id: json.id,
    stop_reason: json.stop_reason,
  }
}

async function main() {
  await loadEnv()
  const args = parseArgs(process.argv.slice(2))
  const dryRun = Boolean(args["dry-run"])
  const runStamp = args["run-stamp"]
  if (!runStamp) throw new Error("--run-stamp is required")
  const runDir = path.join(EPOCH5_ROOT, "runs", runStamp)
  const runFiles = await listJsonFiles(runDir)
  const judgeStamp = tsStamp()
  const judgments = []
  for (const filePath of runFiles) {
    const run = await readJson(filePath)
    if (dryRun) {
      const scored = scoreDry(run)
      const outPath = path.join(EPOCH5_ROOT, "judgments", judgeStamp, `${run.id}.json`)
      await writeJson(outPath, scored)
      judgments.push(scored)
      continue
    }
    const judged = await judgeWithAI(run)
    const scored = {
      run_id: run.id,
      epic: run.epic,
      style: run.style,
      expected_tool: run.expected_first_tool,
      selected_tool: firstTool(run.trace),
      latency_ms: run.durationMs,
      ...judged,
    }
    const outPath = path.join(EPOCH5_ROOT, "judgments", judgeStamp, `${run.id}.json`)
    await writeJson(outPath, scored)
    judgments.push(scored)
  }
  process.stdout.write(`${JSON.stringify({ ok: true, judgeStamp, judgments: judgments.length })}\n`)
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => {
    process.stderr.write(`epoch5-judge fatal: ${error?.stack ?? error}\n`)
    process.exit(1)
  })
}
