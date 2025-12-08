import {
  Column,
  CreateDateColumn,
  Entity,
  ManyToOne,
  OneToMany,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { User } from '../../users/entities/user.entity';
import { GenerationJob } from '../../generation/entities/generation-job.entity';

@Entity({ name: 'uploaded_images' })
export class UploadedImage {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @ManyToOne(() => User, (user) => user.uploadedImages, {
    onDelete: 'SET NULL',
    nullable: true,
  })
  user?: User | null;

  @Column({ name: 'session_id', nullable: true })
  sessionId?: string;

  @Column({ name: 'storage_key', length: 500 })
  storageKey!: string;

  @Column({ name: 'storage_url', length: 1000 })
  storageUrl!: string;

  @Column({ name: 'mime_type', length: 100 })
  mimeType!: string;

  @Column({ name: 'file_size', type: 'int' })
  fileSize!: number;

  @Column({ name: 'original_filename', length: 255, nullable: true })
  originalFilename?: string;

  @Column({ name: 'expires_at', type: 'timestamptz' })
  expiresAt!: Date;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;

  @OneToMany(() => GenerationJob, (job) => job.uploadedImage)
  generationJobs!: GenerationJob[];
}
