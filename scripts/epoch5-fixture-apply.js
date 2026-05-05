#!/usr/bin/env node
import path from "node:path"
import {
  EPOCH5_ROOT,
  loadEnv,
  parseArgs,
  readJson,
  runRconCommands,
  tsStamp,
  writeJson,
} from "./epoch5-lib.js"

export function buildFixtureCommands(fixture = {}, selector = "@p") {
  const commands = []
  if (fixture.position) commands.push(`tp ${selector} ${fixture.position.x} ${fixture.position.y} ${fixture.position.z}`)
  if (fixture.time) {
    const value = fixture.time === "day" || fixture.time === "night" ? fixture.time : Number(fixture.time)
    commands.push(`time set ${value}`)
  }
  if (fixture.weather) commands.push(`weather ${fixture.weather}`)
  if (Array.isArray(fixture.inventory)) {
    commands.push(`clear ${selector}`)
    for (const item of fixture.inventory) {
      const count = Number(item.count ?? 1)
      commands.push(`give ${selector} minecraft:${item.item} ${count}`)
    }
  }
  if (Number.isFinite(Number(fixture.health))) commands.push(`attribute ${selector} minecraft:generic.max_health base set 20`)
  if (Number.isFinite(Number(fixture.health))) commands.push(`data merge entity ${selector} {Health:${Number(fixture.health)}f}`)
  if (Number.isFinite(Number(fixture.food))) commands.push(`effect give ${selector} minecraft:hunger 1 ${Math.max(0, 20 - Number(fixture.food))} true`)
  if (Array.isArray(fixture.blocks)) {
    for (const block of fixture.blocks) {
      commands.push(`execute as ${selector} at @s run setblock ~${block.dx ?? 0} ~${block.dy ?? 0} ~${block.dz ?? 0} minecraft:${block.type}`)
    }
  }
  if (Array.isArray(fixture.entities)) {
    for (const entity of fixture.entities) {
      commands.push(
        `execute as ${selector} at @s run summon minecraft:${entity.type} ~${entity.dx ?? 0} ~${entity.dy ?? 0} ~${entity.dz ?? 0} {Tags:[\"epoch5_fixture\"]}`,
      )
    }
  }
  return commands
}

async function main() {
  await loadEnv()
  const args = parseArgs(process.argv.slice(2))
  const selector = args.selector || `@p[name=${process.env.MC_USERNAME || "mineflayer-bot"}]`
  const dryRun = Boolean(args["dry-run"])
  const fixturePath = args.fixture ? path.resolve(args.fixture) : ""
  const fixtureFile = fixturePath ? await readJson(fixturePath) : null
  const fixture = fixtureFile?.fixture || (fixturePath ? fixtureFile : args["fixture-json"] ? JSON.parse(args["fixture-json"]) : {})
  const commands = buildFixtureCommands(fixture, selector)
  const appliedAt = tsStamp()
  let result = { dryRun: true, commands }
  if (!dryRun) {
    const host = process.env.RCON_HOST
    const port = process.env.RCON_PORT
    const password = process.env.RCON_PASSWORD
    if (!host || !port || !password) throw new Error("RCON_HOST/RCON_PORT/RCON_PASSWORD required unless --dry-run")
    result = { dryRun: false, commands, responses: await runRconCommands({ host, port, password, commands }) }
  }
  const outputPath = path.join(EPOCH5_ROOT, "runs", appliedAt, "fixture-apply.json")
  await writeJson(outputPath, { appliedAt, selector, fixture, ...result })
  process.stdout.write(`${JSON.stringify({ ok: true, outputPath, count: commands.length })}\n`)
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => {
    process.stderr.write(`epoch5-fixture-apply fatal: ${error?.stack ?? error}\n`)
    process.exit(1)
  })
}
