#!/usr/bin/env node
// scripts/nano-smoke.js
// First-contact smoke test for gpt-5-nano + MCP over HTTP.

import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, "..");

async function loadEnv() {
  try {
    const envPath = path.join(REPO_ROOT, ".env");
    const envContent = await readFile(envPath, "utf8");
    for (const line of envContent.split("\n")) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const eqIdx = trimmed.indexOf("=");
      if (eqIdx < 0) continue;
      const key = trimmed.slice(0, eqIdx).trim();
      const value = trimmed.slice(eqIdx + 1).trim();
      if (!process.env[key]) process.env[key] = value;
    }
  } catch {
    // .env not required
  }
}

function usage() {
  console.error("Usage: node scripts/nano-smoke.js <mcp-base-url-or-mcp-url>");
  console.error("Example: node scripts/nano-smoke.js http://127.0.0.1:8080");
  console.error("Example: node scripts/nano-smoke.js http://127.0.0.1:8080/mcp");
}

function normalizeBaseUrl(raw) {
  let u;
  try {
    u = new URL(raw);
  } catch {
    throw new Error("Invalid URL (must be full http/https URL)");
  }
  if (u.protocol !== "https:" && u.protocol !== "http:") {
    throw new Error("URL must use http or https");
  }
  const hasMcpPath = u.pathname.endsWith("/mcp") || u.pathname === "/mcp";
  u.pathname = hasMcpPath ? "/mcp" : "";
  u.search = "";
  u.hash = "";
  return u.toString().replace(/\/$/, "");
}

function extractToolTrace(output) {
  const trace = [];
  if (!Array.isArray(output)) return trace;
  for (const item of output) {
    if (item?.type === "mcp_call") {
      trace.push({
        type: "mcp_call",
        id: item.id,
        name: item.name,
        server_label: item.server_label,
        arguments: item.arguments,
      });
    }
    if (item?.type === "mcp_result") {
      trace.push({
        type: "mcp_result",
        id: item.id,
        name: item.name,
        server_label: item.server_label,
        result: item.result,
        error: item.error,
      });
    }
  }
  return trace;
}

async function main() {
  await loadEnv();

  const baseUrlRaw = process.argv[2];
  if (!baseUrlRaw) {
    usage();
    process.exit(2);
  }

  const apiKey = process.env.OPENAI_API_KEY || process.env.OPENAI_TOKEN;
  if (!apiKey) {
    console.error("Missing OPENAI_API_KEY in environment (.env is supported).");
    process.exit(2);
  }

  let baseUrl;
  try {
    baseUrl = normalizeBaseUrl(baseUrlRaw);
  } catch (err) {
    console.error(String(err?.message ?? err));
    process.exit(2);
  }
  const mcpUrl = baseUrl.endsWith("/mcp") ? baseUrl : `${baseUrl}/mcp`;

  const payload = {
    model: "gpt-5-nano",
    tools: [
      {
        type: "mcp",
        server_label: "minecraft",
        server_url: mcpUrl,
        require_approval: "never",
      },
    ],
    input: "What is your current position in Minecraft?",
  };

  console.log(JSON.stringify({ event: "request", model: payload.model, mcp_url: mcpUrl }, null, 2));

  const res = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  const text = await res.text();
  let json;
  try {
    json = JSON.parse(text);
  } catch {
    console.error("OpenAI response was not valid JSON:");
    console.error(text);
    process.exit(1);
  }

  if (!res.ok) {
    console.error("OpenAI API error:");
    console.error(JSON.stringify(json, null, 2));
    process.exit(1);
  }

  const output = Array.isArray(json.output) ? json.output : [];
  const trace = extractToolTrace(output);

  console.log(JSON.stringify({ event: "tool_trace", count: trace.length, trace }, null, 2));
  console.log(JSON.stringify({ event: "response", response: json }, null, 2));
}

main().catch((err) => {
  console.error(`nano-smoke fatal: ${err?.stack ?? err}`);
  process.exit(1);
});
