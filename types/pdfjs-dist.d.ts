declare module "pdfjs-dist/build/pdf.mjs" {
  export const GlobalWorkerOptions: {
    workerSrc: string;
  };

  export const Util: {
    transform: (matrixA: number[], matrixB: number[]) => number[];
  };

  export function getDocument(options: {
    url: string;
  }): {
    promise: Promise<{
      numPages: number;
      getPage: (pageNumber: number) => Promise<{
        getViewport: (options: { scale: number }) => {
          width: number;
          height: number;
          transform: number[];
        };
        render: (options: {
          canvas: HTMLCanvasElement;
          canvasContext: CanvasRenderingContext2D;
          viewport: {
            width: number;
            height: number;
            transform: number[];
          };
        }) => {
          cancel: () => void;
          promise: Promise<unknown>;
        };
        getTextContent: () => Promise<{
          items: Array<
            | {
                str: string;
                transform: number[];
              }
            | Record<string, unknown>
          >;
        }>;
      }>;
    }>;
  };
}
