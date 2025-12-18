import type { UploadedImage } from '../../images/entities/image.entity';
import type { GeneratedImage } from './generated-image.entity';

export type GenerationJobStatus =
  | 'pending'
  | 'processing'
  | 'completed'
  | 'failed';

export interface GenerationJob {
  id: string;
  userId?: string | null;
  sessionId?: string | null;
  uploadedImageId?: string | null;
  gridConfigId: string;
  variationCount: number;
  status: GenerationJobStatus;
  errorMessage?: string | null;
  startedAt?: Date | null;
  completedAt?: Date | null;
  createdAt: Date;
  // Relations (populated when needed)
  uploadedImage?: UploadedImage | null;
  generatedImages?: GeneratedImage[];
}

export interface GenerationJobRow {
  id: string;
  user_id: string | null;
  session_id: string | null;
  uploaded_image_id: string | null;
  grid_config_id: string;
  variation_count: number;
  status: GenerationJobStatus;
  error_message: string | null;
  started_at: Date | null;
  completed_at: Date | null;
  created_at: Date;
}

export function rowToGenerationJob(row: GenerationJobRow): GenerationJob {
  return {
    id: row.id,
    userId: row.user_id,
    sessionId: row.session_id,
    uploadedImageId: row.uploaded_image_id,
    gridConfigId: row.grid_config_id,
    variationCount: row.variation_count,
    status: row.status,
    errorMessage: row.error_message,
    startedAt: row.started_at,
    completedAt: row.completed_at,
    createdAt: row.created_at,
  };
}
