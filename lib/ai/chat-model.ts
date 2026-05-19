import "server-only";

import { anthropic } from "@ai-sdk/anthropic";
import { groq } from "@ai-sdk/groq";

type ChatProvider = "groq" | "anthropic";

export const CHAT_PROVIDER = getChatProvider();
export const CHAT_MODEL =
  CHAT_PROVIDER === "anthropic"
    ? process.env.ANTHROPIC_MODEL ?? "claude-sonnet-4-20250514"
    : process.env.GROQ_MODEL ?? "llama-3.1-8b-instant";

export function getChatModel() {
  if (CHAT_PROVIDER === "anthropic") {
    if (!process.env.ANTHROPIC_API_KEY) {
      throw new Error("Missing ANTHROPIC_API_KEY.");
    }

    return anthropic(CHAT_MODEL);
  }

  if (!process.env.GROQ_API_KEY) {
    throw new Error("Missing GROQ_API_KEY.");
  }

  return groq(CHAT_MODEL);
}

function getChatProvider(): ChatProvider {
  const provider = process.env.CHAT_PROVIDER ?? "groq";

  if (provider !== "groq" && provider !== "anthropic") {
    throw new Error(`Unsupported CHAT_PROVIDER: ${provider}`);
  }

  return provider;
}
