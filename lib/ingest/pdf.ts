import "server-only";

import "pdfjs-dist/legacy/build/pdf.worker.mjs";
import { PDFParse } from "pdf-parse";

import type { TextPage } from "@/lib/ingest/chunk-text";

export async function parsePdfToPages(data: Buffer): Promise<TextPage[]> {
  const parser = new PDFParse({ data });

  try {
    const result = await parser.getText();

    return result.pages.map((page) => ({
      pageNumber: page.num,
      text: page.text,
    }));
  } finally {
    await parser.destroy();
  }
}
