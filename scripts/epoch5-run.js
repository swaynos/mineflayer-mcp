#!/usr/bin/env node
import path from "node:path"
import { EPOCH5_ROOT, listJsonFiles, loadEnv, parseArgs, readJson, tsStamp, writeJson } from "./epoch5-lib.js"

export function extractTrace(output = []) {
  const trace = []
  for (const item of output) {
    if (item?.type === "mcp_call" || item?.type === "mcp_result") trace.push(item)
  }
  return trace
}

async function callNano({ apiKey, mcpUrl, prompt }) {
  const payload = {
    model: "gpt-5-nano",
    tools: [{ type: "mcp", server_label: "minecraft", server_url: mcpUrl, require_approval: "never" }],
    input: prompt,
  }
  const res = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  })
  const text = await res.text()
  const json = JSON.parse(text)
  if (!res.ok) throw new Error(`OpenAI API error: ${JSON.stringify(json)}`)
  return json
}

async function main() {
  await loadEnv()
  const args = parseArgs(process.argv.slice(2))
  const dryRun = Boolean(args["dry-run"])
  const runStamp = tsStamp()
  const corpusDir = args["corpus-dir"] || path.join(EPOCH5_ROOT, "corpus")
  const files = args.corpus ? [path.resolve(args.corpus)] : await listJsonFiles(corpusDir)
  const limit = Number(args.limit || files.length)
  const mcpUrl = args["mcp-url"] || process.env.EPOCH5_MCP_URL
  if (!dryRun && !mcpUrl) throw new Error("--mcp-url or EPOCH5_MCP_URL is required")
  const apiKey = process.env.OPENAI_API_KEY || process.env.OPENAI_TOKEN
  if (!dryRun && !apiKey) throw new Error("OPENAI_API_KEY is required unless --dry-run")

  const selected = files.slice(0, limit)
  const summary = []
  for (const filePath of selected) {
    const prompt = await readJson(filePath)
    const startedAt = new Date().toISOString()
    const response = dryRun
      ? { output: [{ type: "mcp_call", name: prompt.expected_first_tool || "observe", arguments: {} }] }
      : await callNano({ apiKey, mcpUrl, prompt: prompt.prompt })
    const endedAt = new Date().toISOString()
    const trace = extractTrace(response.output || [])
    const record = {
      id: prompt.id || path.basename(filePath, ".json"),
      epic: prompt.epic || "unknown",
      style: prompt.style || "unknown",
      prompt: prompt.prompt,
      expected_first_tool: prompt.expected_first_tool || null,
      fixture: prompt.fixture || {},
      startedAt,
      endedAt,
      durationMs: Date.parse(endedAt) - Date.parse(startedAt),
      trace,
      response,
      dryRun,
    }
    const outPath = path.join(EPOCH5_ROOT, "runs", runStamp, `${record.id}.json`)
    await writeJson(outPath, record)
    summary.push({ id: record.id, output: outPath, traceCount: trace.length, durationMs: record.durationMs })
  }
  process.stdout.write(`${JSON.stringify({ ok: true, runStamp, prompts: summary.length, summary }, null, 2)}\n`)
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => {
    process.stderr.write(`epoch5-run fatal: ${error?.stack ?? error}\n`)
    process.exit(1)
  })
}
