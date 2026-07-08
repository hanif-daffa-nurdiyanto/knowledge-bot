import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";

export const DOCUMENT_UPLOADS_BUCKET = "document-uploads";

type UploadDocumentFileInput = {
  documentId: string;
  fileName: string;
  fileBuffer: Buffer;
  contentType?: string;
};

export async function uploadDocumentFile({
  documentId,
  fileName,
  fileBuffer,
  contentType = "application/pdf",
}: UploadDocumentFileInput) {
  const supabase = createAdminClient();
  const storagePath = buildDocumentStoragePath(documentId, fileName);
  const { error } = await supabase.storage
    .from(DOCUMENT_UPLOADS_BUCKET)
    .upload(storagePath, fileBuffer, {
      contentType,
      upsert: false,
    });

  if (error) {
    throw error;
  }

  return {
    storageBucket: DOCUMENT_UPLOADS_BUCKET,
    storagePath,
  };
}

export async function downloadDocumentFile(
  storageBucket: string,
  storagePath: string
) {
  const supabase = createAdminClient();
  const { data, error } = await supabase.storage
    .from(storageBucket)
    .download(storagePath);

  if (error) {
    throw error;
  }

  return Buffer.from(await data.arrayBuffer());
}

export async function createDocumentSignedUrl(
  storageBucket: string,
  storagePath: string,
  expiresInSeconds = 60 * 10
) {
  const supabase = createAdminClient();
  const { data, error } = await supabase.storage
    .from(storageBucket)
    .createSignedUrl(storagePath, expiresInSeconds);

  if (error) {
    throw error;
  }

  return data.signedUrl;
}

export async function deleteDocumentFile(
  storageBucket: string,
  storagePath: string
) {
  const supabase = createAdminClient();
  const { error } = await supabase.storage
    .from(storageBucket)
    .remove([storagePath]);

  if (error) {
    throw error;
  }
}

function buildDocumentStoragePath(documentId: string, fileName: string) {
  return `documents/${documentId}/${sanitizeFileName(fileName)}`;
}

function sanitizeFileName(fileName: string) {
  const sanitized = fileName
    .trim()
    .replace(/[^\w.\-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");

  return sanitized || "document.pdf";
}
