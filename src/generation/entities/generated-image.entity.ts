export interface GeneratedImage {
  id: string;
  generationJobId: string;
  variationIndex: number;
  storageKey: string;
  mimeType: string;
  fileSize?: number | null;
  expiresAt: Date | null;
  isPermanent: boolean;
  isPreview: boolean;
  createdAt: Date;
  updatedAt?: Date;
}

export interface GeneratedImageRow {
  id: string;
  generation_job_id: string;
  variation_index: number;
  storage_key: string;
  mime_type: string;
  file_size: number | null;
  expires_at: Date | null;
  is_permanent: boolean;
  is_preview: boolean;
  created_at: Date;
  updated_at?: Date;
}

export function rowToGeneratedImage(row: GeneratedImageRow): GeneratedImage {
  return {
    id: row.id,
    generationJobId: row.generation_job_id,
    variationIndex: row.variation_index,
    storageKey: row.storage_key,
    mimeType: row.mime_type,
    fileSize: row.file_size,
    expiresAt: row.expires_at,
    isPermanent: row.is_permanent,
    isPreview: row.is_preview,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}
