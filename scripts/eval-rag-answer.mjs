#!/usr/bin/env node

import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { performance } from "node:perf_hooks";

const DEFAULT_RETRIEVAL = "eval/rag/reports/retrieval-latest.json";
const DEFAULT_JSON_OUT = "eval/rag/reports/answer-latest.json";
const DEFAULT_MD_OUT = "eval/rag/reports/answer-latest.md";

loadEnvFile(".env.local");
loadEnvFile(".env");

const args = parseArgs(process.argv.slice(2));
const retrievalPath = args.retrieval ?? DEFAULT_RETRIEVAL;
const jsonOutPath = args.out ?? DEFAULT_JSON_OUT;
const markdownOutPath = args.report ?? DEFAULT_MD_OUT;
const configIndex = Number(args["config-index"] ?? 0);
const limit = Number(args.limit ?? Number.POSITIVE_INFINITY);
const judgeEnabled = args.judge === "true" || args.judge === "1";

const retrievalReport = JSON.parse(await readFile(retrievalPath, "utf8"));
const selectedConfig = retrievalReport.configs[configIndex];

if (!selectedConfig) {
  throw new Error(`No config at index ${configIndex} in ${retrievalPath}.`);
}

const supabase = createSupabaseClient();
const cases = retrievalReport.results
  .filter((result) => sameConfig(result.config, selectedConfig))
  .slice(0, limit);
const results = [];

for (const testCase of cases) {
  results.push(await evaluateAnswer({ supabase, testCase }));
}

const report = {
  generated_at: new Date().toISOString(),
  retrieval_report: retrievalPath,
  config: selectedConfig,
  environment: {
    chat_provider: process.env.CHAT_PROVIDER ?? "groq",
    chat_model: getChatModel(),
  },
  judge_enabled: judgeEnabled,
  summary: summarize(results),
  results,
};

await writeJson(jsonOutPath, report);
await writeFileWithDirs(markdownOutPath, renderMarkdownReport(report));

console.log(`Wrote ${jsonOutPath}`);
console.log(`Wrote ${markdownOutPath}`);
console.log(
  [
    `cases=${report.summary.total_cases}`,
    `sourceMarkers=${formatPercent(report.summary.source_marker_rate)}`,
    `sourcesSection=${formatPercent(report.summary.sources_section_rate)}`,
    `negativeRefusal=${formatPercent(report.summary.negative_refusal_rate)}`,
    `judgeScore=${formatNumber(report.summary.average_judge_score)}`,
    `avgMs=${report.summary.average_latency_ms}`,
  ].join(" ")
);

async function evaluateAnswer({ supabase, testCase }) {
  const started = performance.now();
  const chunks = await loadChunks(supabase, testCase.retrieved);
  const answer = chunks.length
    ? await generateAnswer(testCase.question, chunks)
    : noContextAnswer();
  const judge = judgeEnabled
    ? await judgeAnswer({ testCase, answer, chunks })
    : null;
  const metrics = scoreAnswer(testCase, answer);

  return {
    id: testCase.id,
    category: testCase.category,
    question: testCase.question,
    must_answer: testCase.must_answer,
    expected_answer: testCase.expected_answer,
    expected_documents: testCase.expected_documents,
    answer,
    judge,
    metrics: {
      ...metrics,
      source_count: chunks.length,
      total_ms: Math.round(performance.now() - started),
    },
    sources: chunks.map((chunk, index) => ({
      source_id: `S${index + 1}`,
      document_name: chunk.document_name,
      page_number: chunk.page_number,
      chunk_index: chunk.chunk_index,
      similarity: chunk.similarity,
    })),
  };
}

async function loadChunks(supabase, retrieved) {
  const ids = retrieved.map((chunk) => chunk.id);

  if (ids.length === 0) {
    return [];
  }

  const { data, error } = await supabase
    .from("chunks")
    .select("id, document_id, content, page_number, chunk_index")
    .in("id", ids);

  if (error) {
    throw error;
  }

  const byId = new Map((data ?? []).map((chunk) => [chunk.id, chunk]));

  return retrieved
    .map((item) => {
      const chunk = byId.get(item.id);

      if (!chunk) {
        return null;
      }

      return {
        ...item,
        content: chunk.content,
      };
    })
    .filter(Boolean);
}

async function generateAnswer(question, chunks) {
  return callChat([
    {
      role: "system",
      content: buildSystemPrompt(),
    },
    {
      role: "user",
      content: buildUserPrompt(question, chunks),
    },
  ], 0.2);
}

async function judgeAnswer({ testCase, answer, chunks }) {
  const text = await callChat([
    {
      role: "system",
      content: [
        "You are a strict evaluator for a RAG system.",
        "Score only from the expected answer and provided source context.",
        "Return JSON only. Do not use markdown.",
      ].join("\n"),
    },
    {
      role: "user",
      content: buildJudgePrompt({ testCase, answer, chunks }),
    },
  ], 0);
  const jsonText = extractJson(text);

  if (!jsonText) {
    return {
      parse_error: true,
      raw: text,
    };
  }

  try {
    return normalizeJudgeResult(JSON.parse(jsonText));
  } catch {
    return {
      parse_error: true,
      raw: text,
    };
  }
}

async function callChat(messages, temperature) {
  const response = await fetch(getChatUrl(), {
    method: "POST",
    headers: getChatHeaders(),
    body: JSON.stringify({
      model: getChatModel(),
      messages,
      temperature,
    }),
  });

  if (!response.ok) {
    throw new Error(`Chat failed: ${response.status} ${await response.text()}`);
  }

  const data = await response.json();
  return data.choices?.[0]?.message?.content?.trim() ?? "";
}

function buildJudgePrompt({ testCase, answer, chunks }) {
  return [
    `Question: ${testCase.question}`,
    `Must answer: ${testCase.must_answer ? "yes" : "no"}`,
    `Expected answer: ${testCase.expected_answer ?? "n/a"}`,
    "",
    "Generated answer:",
    answer,
    "",
    "Retrieved source context:",
    chunks
      .map((chunk, index) =>
        [
          `[S${index + 1}] ${chunk.document_name}, page ${
            chunk.page_number ?? "unknown"
          }, chunk ${chunk.chunk_index}`,
          truncate(chunk.content.replace(/\s+/g, " "), 1400),
        ].join("\n")
      )
      .join("\n\n"),
    "",
    "Return exactly this JSON shape:",
    JSON.stringify({
      correctness: 0,
      groundedness: 0,
      completeness: 0,
      refusal_ok: true,
      source_attribution_ok: true,
      notes: "short reason",
    }),
    "",
    "Scoring: 0 = bad, 1 = partial, 2 = good. For negative questions, correctness means the answer refuses or says the information is not found.",
  ].join("\n");
}

function buildSystemPrompt() {
  return [
    "You are the company's internal assistant.",
    "Answer employee questions only from the provided document context.",
    "Do not invent information outside the context.",
    "If the context is insufficient, clearly say that the information was not found in the knowledge base.",
    "Answer in the same language as the user question.",
    "Keep answers concise, direct, and include source attribution.",
    "Use source markers like [S1], [S2] in the relevant sentences.",
    "End the answer with a 'Sources:' section listing the sources used.",
  ].join("\n");
}

function buildUserPrompt(question, chunks) {
  return [
    "Knowledge base context:",
    chunks
      .map((chunk, index) =>
        [
          `[S${index + 1}] ${chunk.document_name}, page ${
            chunk.page_number ?? "unknown"
          }, chunk ${chunk.chunk_index}`,
          `Similarity: ${Number(chunk.similarity).toFixed(3)}`,
          chunk.content,
        ].join("\n")
      )
      .join("\n\n"),
    "---",
    `Question: ${question}`,
    "Answer:",
  ].join("\n\n");
}

function scoreAnswer(testCase, answer) {
  const hasSourceMarker = /\[S\d+\]/.test(answer);
  const hasSourcesSection = /sources\s*:/i.test(answer);
  const refusal = /tidak ditemukan|tidak ada informasi|not found|could not find|knowledge base/i.test(
    answer
  );

  return {
    has_source_marker: hasSourceMarker,
    has_sources_section: hasSourcesSection,
    negative_refusal: testCase.must_answer ? null : refusal,
    needs_manual_review: true,
  };
}

function summarize(results) {
  const negatives = results.filter((result) => !result.must_answer);
  const judged = results.filter((result) => result.judge && !result.judge.parse_error);
  const judgeScoreSum = judged.reduce(
    (sum, result) =>
      sum +
      result.judge.correctness +
      result.judge.groundedness +
      result.judge.completeness,
    0
  );

  return {
    total_cases: results.length,
    source_marker_rate: rate(results, (result) => result.metrics.has_source_marker),
    sources_section_rate: rate(
      results,
      (result) => result.metrics.has_sources_section
    ),
    negative_refusal_rate:
      negatives.length > 0
        ? rate(negatives, (result) => result.metrics.negative_refusal)
        : null,
    judged_cases: judged.length,
    average_judge_score:
      judged.length > 0 ? judgeScoreSum / (judged.length * 3) : null,
    judge_correctness_average:
      judged.length > 0
        ? average(judged, (result) => result.judge.correctness)
        : null,
    judge_groundedness_average:
      judged.length > 0
        ? average(judged, (result) => result.judge.groundedness)
        : null,
    judge_completeness_average:
      judged.length > 0
        ? average(judged, (result) => result.judge.completeness)
        : null,
    average_latency_ms: Math.round(
      results.reduce((sum, result) => sum + result.metrics.total_ms, 0) /
        Math.max(results.length, 1)
    ),
  };
}

function renderMarkdownReport(report) {
  const lines = [
    "# RAG Answer Evaluation Report",
    "",
    `Generated at: ${report.generated_at}`,
    `Retrieval report: \`${report.retrieval_report}\``,
    `Config: matchCount=${report.config.matchCount}, threshold=${report.config.threshold}`,
    `Chat: ${report.environment.chat_provider} / ${report.environment.chat_model}`,
    `Judge enabled: ${report.judge_enabled ? "yes" : "no"}`,
    "",
    "## Summary",
    "",
    `- Cases: ${report.summary.total_cases}`,
    `- Source marker rate: ${formatPercent(report.summary.source_marker_rate)}`,
    `- Sources section rate: ${formatPercent(report.summary.sources_section_rate)}`,
    `- Negative refusal rate: ${formatPercent(report.summary.negative_refusal_rate)}`,
    `- Judged cases: ${report.summary.judged_cases}`,
    `- Average judge score: ${formatNumber(report.summary.average_judge_score)} / 2`,
    `- Judge correctness average: ${formatNumber(report.summary.judge_correctness_average)} / 2`,
    `- Judge groundedness average: ${formatNumber(report.summary.judge_groundedness_average)} / 2`,
    `- Judge completeness average: ${formatNumber(report.summary.judge_completeness_average)} / 2`,
    `- Average latency: ${report.summary.average_latency_ms}ms`,
    "",
    "## Cases",
    "",
  ];

  for (const result of report.results) {
    lines.push(
      `### ${result.id}`,
      "",
      `Question: ${result.question}`,
      "",
      `Expected: ${result.expected_answer ?? "n/a"}`,
      "",
      "Answer:",
      "",
      "```txt",
      result.answer,
      "```",
      "",
      `Sources: ${result.sources
        .map(
          (source) =>
            `${source.source_id} ${source.document_name} p${source.page_number ?? "?"} c${source.chunk_index}`
        )
        .join(", ")}`,
      result.judge
        ? [
            "",
            "Judge:",
            "",
            "```json",
            JSON.stringify(result.judge, null, 2),
            "```",
          ].join("\n")
        : "",
      ""
    );
  }

  return `${lines.join("\n")}\n`;
}

function noContextAnswer() {
  return [
    "I could not find enough information in the knowledge base to answer that question.",
    "",
    "Sources:",
    "- None",
  ].join("\n");
}

function createSupabaseClient() {
  return createClient(
    requiredEnv("NEXT_PUBLIC_SUPABASE_URL"),
    requiredEnv("SUPABASE_SERVICE_ROLE_KEY"),
    {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    }
  );
}

function getChatUrl() {
  const provider = process.env.CHAT_PROVIDER ?? "groq";

  if (provider === "groq") {
    return "https://api.groq.com/openai/v1/chat/completions";
  }

  if (provider === "nvidia") {
    return `${stripTrailingSlash(
      process.env.NVIDIA_NIM_BASE_URL ?? "https://integrate.api.nvidia.com/v1"
    )}/chat/completions`;
  }

  if (provider === "openai") {
    return "https://api.openai.com/v1/chat/completions";
  }

  throw new Error(`Unsupported eval chat provider: ${provider}`);
}

function getChatHeaders() {
  const provider = process.env.CHAT_PROVIDER ?? "groq";

  if (provider === "groq") {
    return {
      Authorization: `Bearer ${requiredEnv("GROQ_API_KEY")}`,
      "Content-Type": "application/json",
    };
  }

  if (provider === "nvidia") {
    return {
      Authorization: `Bearer ${requiredEnv("NVIDIA_NIM_API_KEY")}`,
      "Content-Type": "application/json",
    };
  }

  if (provider === "openai") {
    return {
      Authorization: `Bearer ${requiredEnv("OPENAI_API_KEY")}`,
      "Content-Type": "application/json",
    };
  }

  throw new Error(`Unsupported eval chat provider: ${provider}`);
}

function getChatModel() {
  const provider = process.env.CHAT_PROVIDER ?? "groq";

  if (provider === "groq") {
    return process.env.GROQ_MODEL ?? "llama-3.1-8b-instant";
  }

  if (provider === "nvidia") {
    return process.env.NVIDIA_NIM_CHAT_MODEL ?? "meta/llama-3.1-8b-instruct";
  }

  if (provider === "openai") {
    return process.env.OPENAI_MODEL ?? "gpt-4o-mini";
  }

  return "";
}

function sameConfig(left, right) {
  return left.matchCount === right.matchCount && left.threshold === right.threshold;
}

function extractJson(text) {
  const trimmed = text.trim();
  const fencedMatch = trimmed.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);

  if (fencedMatch?.[1]) {
    return fencedMatch[1].trim();
  }

  const start = trimmed.indexOf("{");
  const end = trimmed.lastIndexOf("}");

  if (start === -1 || end === -1 || end <= start) {
    return "";
  }

  return trimmed.slice(start, end + 1);
}

function normalizeJudgeResult(result) {
  return {
    correctness: normalizeScore(result.correctness),
    groundedness: normalizeScore(result.groundedness),
    completeness: normalizeScore(result.completeness),
    refusal_ok: Boolean(result.refusal_ok),
    source_attribution_ok: Boolean(result.source_attribution_ok),
    notes: typeof result.notes === "string" ? result.notes : "",
  };
}

function normalizeScore(value) {
  const score = Number(value);

  if (!Number.isFinite(score)) {
    return 0;
  }

  return Math.min(Math.max(score, 0), 2);
}

function parseArgs(argv) {
  const parsed = {};

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];

    if (!arg.startsWith("--")) {
      continue;
    }

    const key = arg.slice(2);
    const next = argv[index + 1];

    if (!next || next.startsWith("--")) {
      parsed[key] = "true";
      continue;
    }

    parsed[key] = next;
    index += 1;
  }

  return parsed;
}

function loadEnvFile(filePath) {
  let content;

  try {
    content = readFileSync(filePath, "utf8");
  } catch {
    return;
  }

  for (const line of content.split(/\r?\n/)) {
    const trimmed = line.trim();

    if (!trimmed || trimmed.startsWith("#")) {
      continue;
    }

    const equalsIndex = trimmed.indexOf("=");

    if (equalsIndex === -1) {
      continue;
    }

    const key = trimmed.slice(0, equalsIndex).trim();
    const value = stripQuotes(trimmed.slice(equalsIndex + 1).trim());

    if (!(key in process.env)) {
      process.env[key] = value;
    }
  }
}

async function writeJson(filePath, value) {
  await writeFileWithDirs(filePath, `${JSON.stringify(value, null, 2)}\n`);
}

async function writeFileWithDirs(filePath, content) {
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, content);
}

function requiredEnv(name) {
  const value = process.env[name];

  if (!value) {
    throw new Error(`Missing ${name}.`);
  }

  return value;
}

function stripQuotes(value) {
  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    return value.slice(1, -1);
  }

  return value;
}

function stripTrailingSlash(value) {
  return value.replace(/\/$/, "");
}

function rate(values, predicate) {
  return (
    values.filter((value) => Boolean(predicate(value))).length /
    Math.max(values.length, 1)
  );
}

function average(values, selector) {
  return (
    values.reduce((sum, value) => sum + selector(value), 0) /
    Math.max(values.length, 1)
  );
}

function formatPercent(value) {
  if (value === null || value === undefined) {
    return "n/a";
  }

  return `${Math.round(value * 1000) / 10}%`;
}

function formatNumber(value) {
  if (value === null || value === undefined) {
    return "n/a";
  }

  return String(Math.round(Number(value) * 1000) / 1000);
}

function truncate(value, maxLength) {
  return value.length > maxLength ? `${value.slice(0, maxLength)}...` : value;
}
