#!/usr/bin/env node
import { mkdir, readFile, readdir, writeFile } from "node:fs/promises"
import path from "node:path"
import net from "node:net"
import { fileURLToPath } from "node:url"

const __dirname = path.dirname(fileURLToPath(import.meta.url))
export const REPO_ROOT = path.resolve(__dirname, "..")
export const EPOCH5_ROOT = path.join(REPO_ROOT, "opencode", "epoch5")

export async function loadEnv() {
  try {
    const envPath = path.join(REPO_ROOT, ".env")
    const envContent = await readFile(envPath, "utf8")
    for (const line of envContent.split("\n")) {
      const trimmed = line.trim()
      if (!trimmed || trimmed.startsWith("#")) continue
      const eqIdx = trimmed.indexOf("=")
      if (eqIdx < 0) continue
      const key = trimmed.slice(0, eqIdx).trim()
      const value = trimmed.slice(eqIdx + 1).trim()
      if (!process.env[key]) process.env[key] = value
    }
  } catch {
    // .env optional
  }
}

export function parseArgs(argv) {
  const parsed = { _: [] }
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i]
    if (!token.startsWith("--")) {
      parsed._.push(token)
      continue
    }
    const key = token.slice(2)
    const next = argv[i + 1]
    if (!next || next.startsWith("--")) {
      parsed[key] = true
      continue
    }
    parsed[key] = next
    i += 1
  }
  return parsed
}

export function tsStamp() {
  return new Date().toISOString().replace(/[:.]/g, "-")
}

export async function mkdirp(dir) {
  await mkdir(dir, { recursive: true })
}

export async function readJson(filePath) {
  return JSON.parse(await readFile(filePath, "utf8"))
}

export async function writeJson(filePath, value) {
  await mkdirp(path.dirname(filePath))
  await writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8")
}

export async function listJsonFiles(dir) {
  let entries = []
  try {
    entries = await readdir(dir, { withFileTypes: true })
  } catch {
    return []
  }
  const files = []
  for (const entry of entries) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      files.push(...(await listJsonFiles(full)))
      continue
    }
    if (entry.isFile() && entry.name.endsWith(".json")) files.push(full)
  }
  return files.sort()
}

function packet(requestId, type, payload) {
  const str = Buffer.from(payload, "utf8")
  const size = 4 + 4 + str.length + 2
  const buf = Buffer.alloc(4 + size)
  buf.writeInt32LE(size, 0)
  buf.writeInt32LE(requestId, 4)
  buf.writeInt32LE(type, 8)
  str.copy(buf, 12)
  buf.writeInt16LE(0, 12 + str.length)
  return buf
}

function decodePacket(buf) {
  const size = buf.readInt32LE(0)
  const requestId = buf.readInt32LE(4)
  const type = buf.readInt32LE(8)
  const body = buf.subarray(12, 4 + size - 2).toString("utf8")
  return { size, requestId, type, body }
}

async function rconRequest(socket, requestId, type, payload) {
  return new Promise((resolve, reject) => {
    socket.once("error", reject)
    socket.once("data", (buf) => resolve(decodePacket(buf)))
    socket.write(packet(requestId, type, payload))
  })
}

export async function runRconCommands({ host, port, password, commands }) {
  const socket = net.createConnection({ host, port: Number(port) })
  await new Promise((resolve, reject) => {
    socket.once("connect", resolve)
    socket.once("error", reject)
  })
  try {
    const auth = await rconRequest(socket, 1, 3, password)
    if (auth.requestId === -1) throw new Error("RCON auth failed")
    const results = []
    for (let i = 0; i < commands.length; i += 1) {
      const response = await rconRequest(socket, 2 + i, 2, commands[i])
      results.push({ command: commands[i], response: response.body })
    }
    return results
  } finally {
    socket.end()
  }
}
