export interface UploadedImage {
  id: string;
  userId?: string | null;
  sessionId?: string | null;
  storageKey: string;
  mimeType: string;
  fileSize: number;
  originalFilename?: string | null;
  expiresAt: Date;
  createdAt: Date;
}

export interface UploadedImageRow {
  id: string;
  user_id: string | null;
  session_id: string | null;
  storage_key: string;
  mime_type: string;
  file_size: number;
  original_filename: string | null;
  expires_at: Date;
  created_at: Date;
}

export function rowToUploadedImage(row: UploadedImageRow): UploadedImage {
  return {
    id: row.id,
    userId: row.user_id,
    sessionId: row.session_id,
    storageKey: row.storage_key,
    mimeType: row.mime_type,
    fileSize: row.file_size,
    originalFilename: row.original_filename,
    expiresAt: row.expires_at,
    createdAt: row.created_at,
  };
}
