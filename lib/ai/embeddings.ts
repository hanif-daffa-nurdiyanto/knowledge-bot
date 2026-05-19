import "server-only";

import OpenAI from "openai";

type EmbeddingProvider = "ollama" | "openai" | "nvidia";

export const EMBEDDING_PROVIDER = getEmbeddingProvider();
export const EMBEDDING_MODEL =
  EMBEDDING_PROVIDER === "nvidia"
    ? process.env.NVIDIA_NIM_EMBEDDING_MODEL ?? "nvidia/nv-embedqa-e5-v5"
    : EMBEDDING_PROVIDER === "openai"
    ? process.env.OPENAI_EMBEDDING_MODEL ?? "text-embedding-3-small"
    : process.env.OLLAMA_EMBEDDING_MODEL ?? "nomic-embed-text";
export const EMBEDDING_DIMENSIONS = Number(
  EMBEDDING_PROVIDER === "nvidia"
    ? process.env.NVIDIA_NIM_EMBEDDING_DIMENSIONS ?? 1024
    : EMBEDDING_PROVIDER === "openai"
    ? process.env.OPENAI_EMBEDDING_DIMENSIONS ?? 1536
    : process.env.OLLAMA_EMBEDDING_DIMENSIONS ?? 768
);

const DEFAULT_OLLAMA_BASE_URL = "http://localhost:11434";
const DEFAULT_NVIDIA_NIM_BASE_URL = "https://integrate.api.nvidia.com/v1";

let openai: OpenAI | null = null;

type OllamaEmbedResponse = {
  model: string;
  embeddings: number[][];
};

type NvidiaEmbeddingResponse = {
  data: Array<{
    embedding: number[];
    index: number;
  }>;
};

export async function embedTexts(
  texts: string[],
  batchSize = 32,
  inputType: "query" | "passage" = "passage"
) {
  if (EMBEDDING_PROVIDER === "openai") {
    return embedTextsWithOpenAICompatible(texts, batchSize, getOpenAIClient());
  }

  if (EMBEDDING_PROVIDER === "nvidia") {
    return embedTextsWithNvidiaNim(texts, batchSize, inputType);
  }

  return embedTextsWithOllama(texts, batchSize);
}

async function embedTextsWithOllama(texts: string[], batchSize: number) {
  const baseUrl =
    process.env.OLLAMA_BASE_URL?.replace(/\/$/, "") ?? DEFAULT_OLLAMA_BASE_URL;
  const embeddings: number[][] = [];

  for (let start = 0; start < texts.length; start += batchSize) {
    const batch = texts.slice(start, start + batchSize);
    const response = await fetch(`${baseUrl}/api/embed`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: EMBEDDING_MODEL,
        input: batch,
        dimensions: EMBEDDING_DIMENSIONS,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Ollama embedding failed: ${response.status} ${errorText}`);
    }

    const data = (await response.json()) as OllamaEmbedResponse;

    if (!Array.isArray(data.embeddings)) {
      throw new Error("Ollama embedding response did not include embeddings.");
    }

    validateEmbeddingDimensions(data.embeddings);
    embeddings.push(...data.embeddings);
  }

  return embeddings;
}

async function embedTextsWithNvidiaNim(
  texts: string[],
  batchSize: number,
  inputType: "query" | "passage"
) {
  if (!process.env.NVIDIA_NIM_API_KEY) {
    throw new Error("Missing NVIDIA_NIM_API_KEY.");
  }

  const baseUrl =
    process.env.NVIDIA_NIM_BASE_URL?.replace(/\/$/, "") ??
    DEFAULT_NVIDIA_NIM_BASE_URL;
  const embeddings: number[][] = [];

  for (let start = 0; start < texts.length; start += batchSize) {
    const batch = texts.slice(start, start + batchSize);
    const response = await fetch(`${baseUrl}/embeddings`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.NVIDIA_NIM_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: EMBEDDING_MODEL,
        input: batch,
        input_type: inputType,
        encoding_format: "float",
        truncate: "END",
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(
        `NVIDIA NIM embedding failed: ${response.status} ${errorText}`
      );
    }

    const data = (await response.json()) as NvidiaEmbeddingResponse;

    if (!Array.isArray(data.data)) {
      throw new Error("NVIDIA NIM embedding response did not include data.");
    }

    const batchEmbeddings = [...data.data]
      .sort((a, b) => a.index - b.index)
      .map((item) => item.embedding);

    validateEmbeddingDimensions(batchEmbeddings);
    embeddings.push(...batchEmbeddings);
  }

  return embeddings;
}

async function embedTextsWithOpenAICompatible(
  texts: string[],
  batchSize: number,
  client: OpenAI
) {
  const embeddings: number[][] = [];

  for (let start = 0; start < texts.length; start += batchSize) {
    const batch = texts.slice(start, start + batchSize);
    const response = await client.embeddings.create({
      model: EMBEDDING_MODEL,
      input: batch,
      ...getEmbeddingRequestOptions(),
    });

    const sorted = [...response.data].sort((a, b) => a.index - b.index);
    const batchEmbeddings = sorted.map((item) => item.embedding);
    validateEmbeddingDimensions(batchEmbeddings);
    embeddings.push(...batchEmbeddings);
  }

  return embeddings;
}

function getOpenAIClient() {
  if (!process.env.OPENAI_API_KEY) {
    throw new Error("Missing OPENAI_API_KEY.");
  }

  openai ??= new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
  });

  return openai;
}

function getEmbeddingRequestOptions() {
  return {
    dimensions: EMBEDDING_DIMENSIONS,
  };
}

function validateEmbeddingDimensions(embeddings: number[][]) {
  for (const embedding of embeddings) {
    if (embedding.length !== EMBEDDING_DIMENSIONS) {
      throw new Error(
        `Expected ${EMBEDDING_DIMENSIONS} embedding dimensions, got ${embedding.length}.`
      );
    }
  }
}

function getEmbeddingProvider(): EmbeddingProvider {
  const provider = process.env.EMBEDDING_PROVIDER ?? "ollama";

  if (provider !== "ollama" && provider !== "openai" && provider !== "nvidia") {
    throw new Error(`Unsupported EMBEDDING_PROVIDER: ${provider}`);
  }

  return provider;
}
