#!/usr/bin/env node
import path from "node:path"
import { EPOCH5_ROOT, listJsonFiles, parseArgs, readJson, tsStamp, writeJson } from "./epoch5-lib.js"

function pct(part, whole) {
  if (!whole) return 0
  return Number(((part / whole) * 100).toFixed(2))
}

export function summarize(rows) {
  const toolCorrect = rows.filter((r) => r.tool_selection_correct).length
  const argCorrect = rows.filter((r) => r.argument_correct).length
  const latencies = rows.map((r) => Number(r.latency_ms)).filter(Number.isFinite).sort((a, b) => a - b)
  const p95 = latencies.length ? latencies[Math.max(0, Math.ceil(latencies.length * 0.95) - 1)] : 0
  const byEpic = {}
  for (const row of rows) {
    const epic = String(row.epic || "unknown")
    if (!byEpic[epic]) byEpic[epic] = []
    byEpic[epic].push(row)
  }
  return {
    totals: {
      prompts: rows.length,
      tool_selection_accuracy_pct: pct(toolCorrect, rows.length),
      argument_correctness_pct: pct(argCorrect, rows.length),
      latency_p95_ms: p95,
    },
    targets: {
      tool_selection_meets_95: pct(toolCorrect, rows.length) >= 95,
      argument_correctness_meets_90: pct(argCorrect, rows.length) >= 90,
      latency_p95_under_3000: p95 < 3000,
    },
    by_epic: Object.fromEntries(
      Object.entries(byEpic).map(([epic, items]) => [
        epic,
        {
          prompts: items.length,
          tool_selection_accuracy_pct: pct(items.filter((r) => r.tool_selection_correct).length, items.length),
          argument_correctness_pct: pct(items.filter((r) => r.argument_correct).length, items.length),
        },
      ]),
    ),
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2))
  const judgeStamp = args["judge-stamp"]
  if (!judgeStamp) throw new Error("--judge-stamp is required")
  const judgmentDir = path.join(EPOCH5_ROOT, "judgments", judgeStamp)
  const files = await listJsonFiles(judgmentDir)
  const rows = []
  for (const filePath of files) rows.push(await readJson(filePath))
  const report = {
    generated_at: new Date().toISOString(),
    judge_stamp: judgeStamp,
    ...summarize(rows),
  }
  const outStamp = tsStamp()
  const outPath = path.join(EPOCH5_ROOT, "reports", outStamp, "summary.json")
  await writeJson(outPath, report)
  process.stdout.write(`${JSON.stringify({ ok: true, outPath, prompts: rows.length }, null, 2)}\n`)
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => {
    process.stderr.write(`epoch5-report fatal: ${error?.stack ?? error}\n`)
    process.exit(1)
  })
}
