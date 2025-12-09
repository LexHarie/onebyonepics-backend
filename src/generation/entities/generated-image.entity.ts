import {
  Column,
  CreateDateColumn,
  Entity,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import type { GenerationJob } from './generation-job.entity';

@Entity({ name: 'generated_images' })
export class GeneratedImage {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @ManyToOne('GenerationJob', 'generatedImages', {
    onDelete: 'CASCADE',
  })
  generationJob!: GenerationJob;

  @Column({ name: 'variation_index', type: 'int' })
  variationIndex!: number;

  @Column({ name: 'storage_key', length: 500 })
  storageKey!: string;

  @Column({ name: 'storage_url', length: 1000 })
  storageUrl!: string;

  @Column({ name: 'mime_type', length: 100, default: 'image/png' })
  mimeType!: string;

  @Column({ name: 'file_size', type: 'int', nullable: true })
  fileSize?: number | null;

  @Column({ name: 'expires_at', type: 'timestamptz' })
  expiresAt!: Date;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;
}
