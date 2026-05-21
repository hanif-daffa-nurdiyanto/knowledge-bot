import "server-only";

import path from "node:path";
import { pathToFileURL } from "node:url";

import type { TextPage } from "@/lib/ingest/chunk-text";

type PdfParseModule = typeof import("pdf-parse");

export async function parsePdfToPages(data: Buffer): Promise<TextPage[]> {
  ensurePdfJsDomPolyfills();
  const { PDFParse } = (await import("pdf-parse")) as PdfParseModule;
  PDFParse.setWorker(getPdfWorkerUrl());
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

function getPdfWorkerUrl() {
  return pathToFileURL(path.join(process.cwd(), "public", "pdf.worker.mjs")).href;
}

function ensurePdfJsDomPolyfills() {
  globalThis.DOMMatrix ??=
    DOMMatrixPolyfill as unknown as typeof globalThis.DOMMatrix;
  globalThis.ImageData ??=
    ImageDataPolyfill as unknown as typeof globalThis.ImageData;
  globalThis.Path2D ??= Path2DPolyfill as unknown as typeof globalThis.Path2D;
}

class DOMMatrixPolyfill {
  a = 1;
  b = 0;
  c = 0;
  d = 1;
  e = 0;
  f = 0;
  is2D = true;
  isIdentity = true;

  constructor(init?: string | number[]) {
    if (Array.isArray(init) && init.length >= 6) {
      [this.a, this.b, this.c, this.d, this.e, this.f] = init;
      this.isIdentity =
        this.a === 1 &&
        this.b === 0 &&
        this.c === 0 &&
        this.d === 1 &&
        this.e === 0 &&
        this.f === 0;
    }
  }

  multiplySelf() {
    return this;
  }

  preMultiplySelf() {
    return this;
  }

  translateSelf() {
    return this;
  }

  scaleSelf() {
    return this;
  }

  rotateSelf() {
    return this;
  }

  invertSelf() {
    return this;
  }

  transformPoint(point?: { x?: number; y?: number; z?: number; w?: number }) {
    return {
      x: point?.x ?? 0,
      y: point?.y ?? 0,
      z: point?.z ?? 0,
      w: point?.w ?? 1,
    };
  }
}

class ImageDataPolyfill {
  colorSpace = "srgb";
  data: Uint8ClampedArray;
  height: number;
  width: number;

  constructor(data: Uint8ClampedArray, width: number, height?: number) {
    this.data = data;
    this.width = width;
    this.height = height ?? Math.floor(data.length / 4 / width);
  }
}

class Path2DPolyfill {
  addPath() {}
  closePath() {}
  moveTo() {}
  lineTo() {}
  bezierCurveTo() {}
  quadraticCurveTo() {}
  rect() {}
  roundRect() {}
  arc() {}
  arcTo() {}
  ellipse() {}
}
