#!/usr/bin/env node
import path from "node:path"
import { EPOCH5_ROOT, loadEnv, parseArgs, runRconCommands, tsStamp, writeJson } from "./epoch5-lib.js"

export function buildTeardownCommands(selector = "@p") {
  return [
    `kill @e[tag=epoch5_fixture]`,
    `weather clear`,
    `time set day`,
    `effect clear ${selector}`,
  ]
}

async function main() {
  await loadEnv()
  const args = parseArgs(process.argv.slice(2))
  const selector = args.selector || `@p[name=${process.env.MC_USERNAME || "mineflayer-bot"}]`
  const dryRun = Boolean(args["dry-run"])
  const commands = buildTeardownCommands(selector)
  const tornDownAt = tsStamp()
  let result = { dryRun: true, commands }
  if (!dryRun) {
    const host = process.env.RCON_HOST
    const port = process.env.RCON_PORT
    const password = process.env.RCON_PASSWORD
    if (!host || !port || !password) throw new Error("RCON_HOST/RCON_PORT/RCON_PASSWORD required unless --dry-run")
    result = { dryRun: false, commands, responses: await runRconCommands({ host, port, password, commands }) }
  }
  const outputPath = path.join(EPOCH5_ROOT, "runs", tornDownAt, "fixture-teardown.json")
  await writeJson(outputPath, { tornDownAt, selector, ...result })
  process.stdout.write(`${JSON.stringify({ ok: true, outputPath, count: commands.length })}\n`)
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => {
    process.stderr.write(`epoch5-fixture-teardown fatal: ${error?.stack ?? error}\n`)
    process.exit(1)
  })
}
