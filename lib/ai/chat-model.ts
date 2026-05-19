import "server-only";

import { anthropic } from "@ai-sdk/anthropic";
import { groq } from "@ai-sdk/groq";
import { createOpenAI } from "@ai-sdk/openai";
import { createOpenAICompatible } from "@ai-sdk/openai-compatible";

type ChatProvider = "groq" | "anthropic" | "nvidia";

export const CHAT_PROVIDER = getChatProvider();
export const CHAT_MODEL =
  CHAT_PROVIDER === "anthropic"
    ? process.env.ANTHROPIC_MODEL ?? "claude-sonnet-4-20250514"
    : CHAT_PROVIDER === "nvidia"
      ? process.env.NVIDIA_NIM_CHAT_MODEL ??
      "nvidia/llama-3.1-nemotron-ultra-253b-v1"
      : process.env.GROQ_MODEL ?? "llama-3.1-8b-instant";

const DEFAULT_NVIDIA_NIM_BASE_URL = "https://integrate.api.nvidia.com/v1";

export function getChatModel() {
  if (CHAT_PROVIDER === "anthropic") {
    if (!process.env.ANTHROPIC_API_KEY) {
      throw new Error("Missing ANTHROPIC_API_KEY.");
    }

    return anthropic(CHAT_MODEL);
  }

  if (CHAT_PROVIDER === "nvidia") {
    if (!process.env.NVIDIA_NIM_API_KEY) {
      throw new Error("Missing NVIDIA_NIM_API_KEY.");
    }

    const nvidia = createOpenAICompatible({
      name: "nvidia",
      apiKey: process.env.NVIDIA_NIM_API_KEY,
      baseURL:
        process.env.NVIDIA_NIM_BASE_URL?.replace(/\/$/, "") ??
        DEFAULT_NVIDIA_NIM_BASE_URL,
    });

    return nvidia.chatModel(CHAT_MODEL);
  }

  if (!process.env.GROQ_API_KEY) {
    throw new Error("Missing GROQ_API_KEY.");
  }

  return groq(CHAT_MODEL);
}

function getChatProvider(): ChatProvider {
  const provider = process.env.CHAT_PROVIDER ?? "groq";

  if (provider !== "groq" && provider !== "anthropic" && provider !== "nvidia") {
    throw new Error(`Unsupported CHAT_PROVIDER: ${provider}`);
  }

  return provider;
}
