import { getEncoding } from "js-tiktoken";

const encoding = getEncoding("cl100k_base");

export type TextPage = {
  pageNumber: number;
  text: string;
};

export type TextChunk = {
  content: string;
  pageNumber: number;
  chunkIndex: number;
  tokenCount: number;
};

export type ChunkOptions = {
  chunkSize?: number;
  overlap?: number;
};

const DEFAULT_CHUNK_SIZE = 500;
const DEFAULT_OVERLAP = 50;

export function countTokens(text: string) {
  return encoding.encode(text).length;
}

export function chunkTextPages(
  pages: TextPage[],
  options: ChunkOptions = {}
): TextChunk[] {
  const chunkSize = options.chunkSize ?? DEFAULT_CHUNK_SIZE;
  const overlap = options.overlap ?? DEFAULT_OVERLAP;

  if (chunkSize <= 0) {
    throw new Error("chunkSize must be greater than 0.");
  }

  if (overlap < 0 || overlap >= chunkSize) {
    throw new Error("overlap must be lower than chunkSize.");
  }

  const step = chunkSize - overlap;
  const chunks: TextChunk[] = [];

  for (const page of pages) {
    const normalizedText = normalizeText(page.text);

    if (!normalizedText) {
      continue;
    }

    const tokens = encoding.encode(normalizedText);

    for (let start = 0; start < tokens.length; start += step) {
      const tokenSlice = tokens.slice(start, start + chunkSize);
      const content = encoding.decode(tokenSlice).trim();

      if (!content) {
        continue;
      }

      chunks.push({
        content,
        pageNumber: page.pageNumber,
        chunkIndex: chunks.length,
        tokenCount: tokenSlice.length,
      });

      if (start + chunkSize >= tokens.length) {
        break;
      }
    }
  }

  return chunks;
}

function normalizeText(text: string) {
  return text
    .replace(/\r/g, "\n")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}
