export interface GeneratedImage {
  id: string;
  generationJobId: string;
  variationIndex: number;
  storageKey: string;
  storageUrl: string;
  mimeType: string;
  fileSize?: number | null;
  expiresAt: Date;
  createdAt: Date;
}

export interface GeneratedImageRow {
  id: string;
  generation_job_id: string;
  variation_index: number;
  storage_key: string;
  storage_url: string;
  mime_type: string;
  file_size: number | null;
  expires_at: Date;
  created_at: Date;
}

export function rowToGeneratedImage(row: GeneratedImageRow): GeneratedImage {
  return {
    id: row.id,
    generationJobId: row.generation_job_id,
    variationIndex: row.variation_index,
    storageKey: row.storage_key,
    storageUrl: row.storage_url,
    mimeType: row.mime_type,
    fileSize: row.file_size,
    expiresAt: row.expires_at,
    createdAt: row.created_at,
  };
}
