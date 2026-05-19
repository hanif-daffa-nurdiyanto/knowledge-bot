import { FileText } from "lucide-react";

import { cn } from "@/lib/utils";

export type SourceCardData = {
  id: string;
  document_id: string;
  document_name: string;
  page_number: number | null;
  chunk_index: number;
  similarity: number;
};

type SourceCardProps = {
  source: SourceCardData;
  compact?: boolean;
};

export function SourceCard({ source, compact }: SourceCardProps) {
  const confidence = Math.round(source.similarity * 100);

  return (
    <div
      className={cn(
        "rounded-md border bg-card p-3 text-card-foreground shadow-xs",
        compact && "p-2.5"
      )}
    >
      <div className="flex items-start gap-3">
        <div className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground">
          <FileText className="size-4" aria-hidden="true" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="rounded-sm bg-primary px-1.5 py-0.5 text-[10px] font-medium text-primary-foreground">
              {source.id}
            </span>
            <p className="truncate text-sm font-medium">{source.document_name}</p>
          </div>
          <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground">
            <span>
              {source.page_number ? `Page ${source.page_number}` : "No page"}
            </span>
            <span>Chunk {source.chunk_index}</span>
            <span>{confidence}% match</span>
          </div>
        </div>
      </div>
    </div>
  );
}
