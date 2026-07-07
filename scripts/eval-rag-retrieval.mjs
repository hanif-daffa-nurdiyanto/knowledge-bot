#!/usr/bin/env node

import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { performance } from "node:perf_hooks";

const DEFAULT_DATASET = "eval/rag/questions.jsonl";
const DEFAULT_JSON_OUT = "eval/rag/reports/retrieval-latest.json";
const DEFAULT_MD_OUT = "eval/rag/reports/retrieval-latest.md";

loadEnvFile(".env.local");
loadEnvFile(".env");

const args = parseArgs(process.argv.slice(2));
const datasetPath = args.dataset ?? DEFAULT_DATASET;
const jsonOutPath = args.out ?? DEFAULT_JSON_OUT;
const markdownOutPath = args.report ?? DEFAULT_MD_OUT;
const matchCounts = parseNumberList(args["match-counts"]) ?? [
  getNumberEnv("MATCH_COUNT", 5),
];
const thresholds = parseNumberList(args.thresholds) ?? [
  getNumberEnv(
    "RAG_MATCH_THRESHOLD",
    getEmbeddingProvider() === "ollama" ? 0.55 : 0.75
  ),
];

const startedAt = new Date();
const dataset = await readJsonl(datasetPath);
const configs = buildConfigs(matchCounts, thresholds);
const supabase = createSupabaseClient();
const results = [];
const embeddingCache = new Map();

for (const config of configs) {
  for (const testCase of dataset) {
    results.push(
      await evaluateCase({ supabase, testCase, config, embeddingCache })
    );
  }
}

const report = {
  generated_at: startedAt.toISOString(),
  dataset: datasetPath,
  environment: getEnvironmentSnapshot(),
  configs,
  summary: summarizeResults(results),
  results,
};

await writeJson(jsonOutPath, report);
await writeFileWithDirs(markdownOutPath, renderMarkdownReport(report));

printSummary(report, jsonOutPath, markdownOutPath);

async function evaluateCase({ supabase, testCase, config, embeddingCache }) {
  const started = performance.now();
  const embeddingStarted = performance.now();
  const queryEmbedding = await getCachedEmbedding(
    embeddingCache,
    testCase.question
  );
  const embeddingMs = performance.now() - embeddingStarted;

  const searchStarted = performance.now();
  const { data, error } = await supabase.rpc("match_document_chunks", {
    query_embedding: formatVector(queryEmbedding),
    match_count: config.matchCount,
    match_threshold: config.threshold,
  });
  const searchMs = performance.now() - searchStarted;

  if (error) {
    throw new Error(
      `Retrieval failed for ${testCase.id}: ${error.message}`
    );
  }

  const retrieved = (data ?? []).map((chunk, index) => ({
    rank: index + 1,
    id: chunk.id,
    document_id: chunk.document_id,
    document_name: chunk.document_name,
    page_number: chunk.page_number,
    chunk_index: chunk.chunk_index,
    similarity: chunk.similarity,
    preview: truncate(chunk.content.replace(/\s+/g, " "), 220),
  }));

  const documentRank = findDocumentRank(testCase, retrieved);
  const sourceRank = findSourceRank(testCase, retrieved);
  const mustAnswer = testCase.must_answer !== false;

  return {
    id: testCase.id,
    category: testCase.category ?? "uncategorized",
    question: testCase.question,
    expected_answer: testCase.expected_answer ?? null,
    must_answer: mustAnswer,
    expected_documents: testCase.expected_documents ?? [],
    expected_sources: testCase.expected_sources ?? [],
    config,
    metrics: {
      document_hit: mustAnswer ? documentRank !== null : null,
      document_rank: documentRank,
      source_hit: mustAnswer ? sourceRank !== null : null,
      source_rank: sourceRank,
      reciprocal_document_rank: documentRank ? 1 / documentRank : 0,
      reciprocal_source_rank: sourceRank ? 1 / sourceRank : 0,
      negative_false_positive: !mustAnswer && retrieved.length > 0,
      retrieved_count: retrieved.length,
      embedding_ms: Math.round(embeddingMs),
      search_ms: Math.round(searchMs),
      total_ms: Math.round(performance.now() - started),
    },
    retrieved,
  };
}

async function getCachedEmbedding(cache, query) {
  const key = `${getEmbeddingProvider()}:${getEmbeddingModel()}:${query}`;
  const cached = cache.get(key);

  if (cached) {
    return cached;
  }

  const [embedding] = await embedTexts([query], "query");
  cache.set(key, embedding);

  return embedding;
}

function findDocumentRank(testCase, retrieved) {
  const expectedDocuments = new Set(testCase.expected_documents ?? []);

  if (expectedDocuments.size === 0) {
    return null;
  }

  const match = retrieved.find((chunk) =>
    expectedDocuments.has(chunk.document_name)
  );

  return match?.rank ?? null;
}

function findSourceRank(testCase, retrieved) {
  const expectedSources = testCase.expected_sources ?? [];

  if (expectedSources.length === 0) {
    return null;
  }

  const match = retrieved.find((chunk) =>
    expectedSources.some((source) => sourceMatches(source, chunk))
  );

  return match?.rank ?? null;
}

function sourceMatches(source, chunk) {
  if (source.document_name && source.document_name !== chunk.document_name) {
    return false;
  }

  if (
    Number.isInteger(source.page_number) &&
    source.page_number !== chunk.page_number
  ) {
    return false;
  }

  if (
    Number.isInteger(source.chunk_index) &&
    source.chunk_index !== chunk.chunk_index
  ) {
    return false;
  }

  return true;
}

function summarizeResults(results) {
  const byConfig = new Map();

  for (const result of results) {
    const key = configKey(result.config);
    const current = byConfig.get(key) ?? {
      config: result.config,
      total: 0,
      answerable: 0,
      negative: 0,
      documentHits: 0,
      sourceHits: 0,
      reciprocalDocumentRankSum: 0,
      reciprocalSourceRankSum: 0,
      negativeFalsePositives: 0,
      totalLatencyMs: 0,
      totalRetrieved: 0,
      failures: [],
    };

    current.total += 1;
    current.totalLatencyMs += result.metrics.total_ms;
    current.totalRetrieved += result.metrics.retrieved_count;

    if (result.must_answer) {
      current.answerable += 1;
      current.documentHits += result.metrics.document_hit ? 1 : 0;
      current.sourceHits += result.metrics.source_hit ? 1 : 0;
      current.reciprocalDocumentRankSum +=
        result.metrics.reciprocal_document_rank;
      current.reciprocalSourceRankSum += result.metrics.reciprocal_source_rank;

      if (!result.metrics.document_hit || !result.metrics.source_hit) {
        current.failures.push({
          id: result.id,
          question: result.question,
          document_hit: result.metrics.document_hit,
          source_hit: result.metrics.source_hit,
          top_result: result.retrieved[0] ?? null,
        });
      }
    } else {
      current.negative += 1;
      current.negativeFalsePositives += result.metrics.negative_false_positive
        ? 1
        : 0;

      if (result.metrics.negative_false_positive) {
        current.failures.push({
          id: result.id,
          question: result.question,
          negative_false_positive: true,
          top_result: result.retrieved[0] ?? null,
        });
      }
    }

    byConfig.set(key, current);
  }

  return [...byConfig.values()].map((summary) => ({
    config: summary.config,
    total_cases: summary.total,
    answerable_cases: summary.answerable,
    negative_cases: summary.negative,
    document_hit_rate:
      summary.answerable > 0 ? summary.documentHits / summary.answerable : null,
    source_hit_rate:
      summary.answerable > 0 ? summary.sourceHits / summary.answerable : null,
    document_mrr:
      summary.answerable > 0
        ? summary.reciprocalDocumentRankSum / summary.answerable
        : null,
    source_mrr:
      summary.answerable > 0
        ? summary.reciprocalSourceRankSum / summary.answerable
        : null,
    negative_false_positive_rate:
      summary.negative > 0
        ? summary.negativeFalsePositives / summary.negative
        : null,
    average_latency_ms: Math.round(summary.totalLatencyMs / summary.total),
    average_retrieved_count: round(summary.totalRetrieved / summary.total, 2),
    failures: summary.failures,
  }));
}

function renderMarkdownReport(report) {
  const lines = [
    "# RAG Retrieval Evaluation Report",
    "",
    `Generated at: ${report.generated_at}`,
    "",
    "## Environment",
    "",
    `- Embedding provider: \`${report.environment.embedding_provider}\``,
    `- Embedding model: \`${report.environment.embedding_model}\``,
    `- Embedding dimensions: \`${report.environment.embedding_dimensions}\``,
    `- Dataset: \`${report.dataset}\``,
    "",
    "## Summary",
    "",
    "| matchCount | threshold | doc hit | source hit | doc MRR | source MRR | negative FP | avg ms | avg retrieved |",
    "| ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |",
  ];

  for (const summary of report.summary) {
    lines.push(
      [
        `| ${summary.config.matchCount}`,
        formatNumber(summary.config.threshold),
        formatPercent(summary.document_hit_rate),
        formatPercent(summary.source_hit_rate),
        formatNumber(summary.document_mrr),
        formatNumber(summary.source_mrr),
        formatPercent(summary.negative_false_positive_rate),
        String(summary.average_latency_ms),
        formatNumber(summary.average_retrieved_count),
      ].join(" | ") + " |"
    );
  }

  lines.push("", "## Top Failures", "");

  for (const summary of report.summary) {
    lines.push(
      `### matchCount=${summary.config.matchCount}, threshold=${summary.config.threshold}`,
      ""
    );

    if (summary.failures.length === 0) {
      lines.push("No failures for this config.", "");
      continue;
    }

    for (const failure of summary.failures.slice(0, 10)) {
      lines.push(
        `- \`${failure.id}\`: ${failure.question}`,
        `  - top result: ${
          failure.top_result
            ? `${failure.top_result.document_name} p${failure.top_result.page_number ?? "?"} c${failure.top_result.chunk_index} (${formatNumber(failure.top_result.similarity)})`
            : "none"
        }`
      );
    }

    lines.push("");
  }

  return `${lines.join("\n")}\n`;
}

async function embedTexts(texts, inputType) {
  const provider = getEmbeddingProvider();

  if (provider === "nvidia") {
    return embedWithNvidia(texts, inputType);
  }

  if (provider === "openai") {
    return embedWithOpenAI(texts);
  }

  return embedWithOllama(texts);
}

async function embedWithNvidia(texts, inputType) {
  const apiKey = requiredEnv("NVIDIA_NIM_API_KEY");
  const baseUrl = stripTrailingSlash(
    process.env.NVIDIA_NIM_BASE_URL ?? "https://integrate.api.nvidia.com/v1"
  );
  const response = await fetch(`${baseUrl}/embeddings`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model:
        process.env.NVIDIA_NIM_EMBEDDING_MODEL ?? "nvidia/nv-embedqa-e5-v5",
      input: texts,
      input_type: inputType,
      encoding_format: "float",
      truncate: "END",
    }),
  });

  if (!response.ok) {
    throw new Error(
      `NVIDIA embedding failed: ${response.status} ${await response.text()}`
    );
  }

  const data = await response.json();
  return [...data.data]
    .sort((a, b) => a.index - b.index)
    .map((item) => item.embedding);
}

async function embedWithOpenAI(texts) {
  const response = await fetch("https://api.openai.com/v1/embeddings", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${requiredEnv("OPENAI_API_KEY")}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: process.env.OPENAI_EMBEDDING_MODEL ?? "text-embedding-3-small",
      input: texts,
      dimensions: getNumberEnv("OPENAI_EMBEDDING_DIMENSIONS", 1536),
    }),
  });

  if (!response.ok) {
    throw new Error(
      `OpenAI embedding failed: ${response.status} ${await response.text()}`
    );
  }

  const data = await response.json();
  return [...data.data]
    .sort((a, b) => a.index - b.index)
    .map((item) => item.embedding);
}

async function embedWithOllama(texts) {
  const baseUrl = stripTrailingSlash(
    process.env.OLLAMA_BASE_URL ?? "http://localhost:11434"
  );
  const response = await fetch(`${baseUrl}/api/embed`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: process.env.OLLAMA_EMBEDDING_MODEL ?? "nomic-embed-text",
      input: texts,
      dimensions: getNumberEnv("OLLAMA_EMBEDDING_DIMENSIONS", 768),
    }),
  });

  if (!response.ok) {
    throw new Error(
      `Ollama embedding failed: ${response.status} ${await response.text()}`
    );
  }

  const data = await response.json();
  return data.embeddings;
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

async function readJsonl(filePath) {
  const content = await readFile(filePath, "utf8");
  return content
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line, index) => {
      try {
        return JSON.parse(line);
      } catch (error) {
        throw new Error(
          `Invalid JSONL at ${filePath}:${index + 1}: ${error.message}`
        );
      }
    });
}

async function writeJson(filePath, value) {
  await writeFileWithDirs(filePath, `${JSON.stringify(value, null, 2)}\n`);
}

async function writeFileWithDirs(filePath, content) {
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, content);
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

function parseNumberList(value) {
  if (!value) {
    return null;
  }

  const values = value
    .split(",")
    .map((item) => Number(item.trim()))
    .filter((item) => Number.isFinite(item));

  return values.length > 0 ? values : null;
}

function buildConfigs(matchCounts, thresholds) {
  return matchCounts.flatMap((matchCount) =>
    thresholds.map((threshold) => ({
      matchCount,
      threshold,
      filterLlm: "OFF",
    }))
  );
}

function loadEnvFile(filePath) {
  let content;

  try {
    content = readFileSyncUtf8(filePath);
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

function readFileSyncUtf8(filePath) {
  return readFileSync(filePath, "utf8");
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

function getEnvironmentSnapshot() {
  return {
    embedding_provider: getEmbeddingProvider(),
    embedding_model: getEmbeddingModel(),
    embedding_dimensions: getEmbeddingDimensions(),
    match_count_env: process.env.MATCH_COUNT ?? null,
    threshold_env: process.env.RAG_MATCH_THRESHOLD ?? null,
  };
}

function getEmbeddingProvider() {
  return process.env.EMBEDDING_PROVIDER ?? "ollama";
}

function getEmbeddingModel() {
  const provider = getEmbeddingProvider();

  if (provider === "nvidia") {
    return process.env.NVIDIA_NIM_EMBEDDING_MODEL ?? "nvidia/nv-embedqa-e5-v5";
  }

  if (provider === "openai") {
    return process.env.OPENAI_EMBEDDING_MODEL ?? "text-embedding-3-small";
  }

  return process.env.OLLAMA_EMBEDDING_MODEL ?? "nomic-embed-text";
}

function getEmbeddingDimensions() {
  const provider = getEmbeddingProvider();

  if (provider === "nvidia") {
    return getNumberEnv("NVIDIA_NIM_EMBEDDING_DIMENSIONS", 1024);
  }

  if (provider === "openai") {
    return getNumberEnv("OPENAI_EMBEDDING_DIMENSIONS", 1536);
  }

  return getNumberEnv("OLLAMA_EMBEDDING_DIMENSIONS", 768);
}

function getNumberEnv(name, fallback) {
  const value = Number(process.env[name]);
  return Number.isFinite(value) ? value : fallback;
}

function requiredEnv(name) {
  const value = process.env[name];

  if (!value) {
    throw new Error(`Missing ${name}.`);
  }

  return value;
}

function formatVector(values) {
  return `[${values.join(",")}]`;
}

function configKey(config) {
  return `${config.matchCount}:${config.threshold}:${config.filterLlm}`;
}

function truncate(value, maxLength) {
  return value.length > maxLength ? `${value.slice(0, maxLength)}...` : value;
}

function round(value, decimals) {
  const multiplier = 10 ** decimals;
  return Math.round(value * multiplier) / multiplier;
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

  return String(round(Number(value), 3));
}

function stripTrailingSlash(value) {
  return value.replace(/\/$/, "");
}

function printSummary(report, jsonOutPath, markdownOutPath) {
  console.log(`Wrote ${jsonOutPath}`);
  console.log(`Wrote ${markdownOutPath}`);

  for (const summary of report.summary) {
    console.log(
      [
        `matchCount=${summary.config.matchCount}`,
        `threshold=${summary.config.threshold}`,
        `docHit=${formatPercent(summary.document_hit_rate)}`,
        `sourceHit=${formatPercent(summary.source_hit_rate)}`,
        `negativeFP=${formatPercent(summary.negative_false_positive_rate)}`,
        `avgMs=${summary.average_latency_ms}`,
      ].join(" ")
    );
  }
}
