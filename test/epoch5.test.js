import test from "node:test"
import assert from "node:assert/strict"
import { mkdtemp, rm, writeFile } from "node:fs/promises"
import path from "node:path"
import os from "node:os"
import http from "node:http"

import { buildFixtureCommands } from "../scripts/epoch5-fixture-apply.js"
import { buildTeardownCommands } from "../scripts/epoch5-fixture-teardown.js"
import { extractTrace } from "../scripts/epoch5-run.js"
import { buildJudgePrompt, judgeWithAI, parseJudgeJson, scoreDry } from "../scripts/epoch5-judge.js"
import { summarize } from "../scripts/epoch5-report.js"
import { listJsonFiles, parseArgs, readJson, writeJson } from "../scripts/epoch5-lib.js"

test("parseArgs parses booleans and values", () => {
  const args = parseArgs(["--dry-run", "--limit", "5", "extra"])
  assert.equal(args["dry-run"], true)
  assert.equal(args.limit, "5")
  assert.deepEqual(args._, ["extra"])
})

test("buildFixtureCommands maps fixture to RCON commands", () => {
  const commands = buildFixtureCommands(
    {
      position: { x: 1, y: 70, z: -2 },
      time: "night",
      weather: "rain",
      inventory: [{ item: "torch", count: 8 }],
      entities: [{ type: "pig", dx: 2, dy: 0, dz: 0 }],
      blocks: [{ type: "stone", dx: 1, dy: 0, dz: 1 }],
    },
    "@p[name=testbot]",
  )
  assert.ok(commands.some((line) => line.startsWith("tp @p[name=testbot] 1 70 -2")))
  assert.ok(commands.includes("time set night"))
  assert.ok(commands.includes("weather rain"))
  assert.ok(commands.includes("clear @p[name=testbot]"))
  assert.ok(commands.includes("give @p[name=testbot] minecraft:torch 8"))
  assert.ok(commands.some((line) => line.includes("setblock ~1 ~0 ~1 minecraft:stone")))
  assert.ok(commands.some((line) => line.includes("summon minecraft:pig")))
})

test("buildTeardownCommands always includes fixture cleanup tag", () => {
  const commands = buildTeardownCommands("@p[name=testbot]")
  assert.equal(commands[0], "kill @e[tag=epoch5_fixture]")
  assert.ok(commands.includes("weather clear"))
  assert.ok(commands.includes("time set day"))
})

test("extractTrace keeps only MCP events", () => {
  const trace = extractTrace([
    { type: "message", text: "hi" },
    { type: "mcp_call", name: "status" },
    { type: "mcp_result", name: "status" },
  ])
  assert.equal(trace.length, 2)
  assert.equal(trace[0].type, "mcp_call")
  assert.equal(trace[1].type, "mcp_result")
})

test("scoreDry evaluates first-tool correctness", () => {
  const row = scoreDry({
    id: "E1-001",
    epic: "1",
    style: "smp",
    expected_first_tool: "status",
    durationMs: 1200,
    trace: [{ type: "mcp_call", name: "status" }],
  })
  assert.equal(row.tool_selection_correct, true)
  assert.equal(row.argument_correct, true)
  assert.equal(row.score, 1)
})

test("buildJudgePrompt contains rubric-critical fields", () => {
  const prompt = buildJudgePrompt({
    prompt: "yo where u at",
    expected_first_tool: "status",
    trace: [{ type: "mcp_call", name: "status", arguments: {} }],
  })
  assert.ok(prompt.includes("Return ONLY valid JSON"))
  assert.ok(prompt.includes("Expected first tool: status"))
  assert.ok(prompt.includes('"tool_selection_correct":boolean'))
})

test("parseJudgeJson accepts fenced JSON and validates fields", () => {
  const parsed = parseJudgeJson("```json\n{\"tool_selection_correct\":true,\"argument_correct\":false,\"intent_fidelity\":88,\"rationale\":\"ok\"}\n```")
  assert.equal(parsed.tool_selection_correct, true)
  assert.equal(parsed.argument_correct, false)
  assert.equal(parsed.intent_fidelity, 88)
})

test("judgeWithAI parses live API response shape", async () => {
  const previousKey = process.env.OPENAI_API_KEY
  process.env.OPENAI_API_KEY = "test-key"
  const server = http.createServer((req, res) => {
    if (req.url !== "/v1/responses") {
      res.writeHead(404)
      res.end("not found")
      return
    }
    res.setHeader("content-type", "application/json")
    res.end(
      JSON.stringify({
        id: "msg_test_1",
        stop_reason: "end_turn",
        output: [
          {
            type: "message",
            content: [
              {
                type: "output_text",
                text: '{"tool_selection_correct":true,"argument_correct":true,"intent_fidelity":97,"rationale":"good"}',
              },
            ],
          },
        ],
      }),
    )
  })
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve))
  const address = server.address()
  const baseUrl = `http://127.0.0.1:${address.port}`
  try {
    const judged = await judgeWithAI({ prompt: "x", trace: [] }, { baseUrl })
    assert.equal(judged.tool_selection_correct, true)
    assert.equal(judged.argument_correct, true)
    assert.equal(judged.intent_fidelity, 97)
    assert.equal(judged.judge_id, "msg_test_1")
  } finally {
    await new Promise((resolve, reject) => server.close((err) => (err ? reject(err) : resolve())))
    if (previousKey === undefined) delete process.env.OPENAI_API_KEY
    else process.env.OPENAI_API_KEY = previousKey
  }
})

test("summarize computes totals and target checks", () => {
  const report = summarize([
    { epic: "1", tool_selection_correct: true, argument_correct: true, latency_ms: 1000 },
    { epic: "1", tool_selection_correct: false, argument_correct: true, latency_ms: 3500 },
  ])
  assert.equal(report.totals.prompts, 2)
  assert.equal(report.totals.tool_selection_accuracy_pct, 50)
  assert.equal(report.totals.argument_correctness_pct, 100)
  assert.equal(report.targets.latency_p95_under_3000, false)
})

test("listJsonFiles recursively returns sorted json paths", async () => {
  const temp = await mkdtemp(path.join(os.tmpdir(), "epoch5-test-"))
  try {
    await writeJson(path.join(temp, "b.json"), { b: 1 })
    await writeJson(path.join(temp, "a", "a.json"), { a: 1 })
    await writeFile(path.join(temp, "ignore.txt"), "x", "utf8")
    const files = await listJsonFiles(temp)
    assert.equal(files.length, 2)
    const loaded = await readJson(files[0])
    assert.ok(typeof loaded === "object")
  } finally {
    await rm(temp, { recursive: true, force: true })
  }
})
