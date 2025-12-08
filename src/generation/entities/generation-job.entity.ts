import {
  Column,
  CreateDateColumn,
  Entity,
  ManyToOne,
  OneToMany,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { User } from '../../users/entities/user.entity';
import { UploadedImage } from '../../images/entities/image.entity';
import { GeneratedImage } from './generated-image.entity';

export type GenerationJobStatus =
  | 'pending'
  | 'processing'
  | 'completed'
  | 'failed';

@Entity({ name: 'generation_jobs' })
export class GenerationJob {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @ManyToOne(() => User, (user) => user.generationJobs, {
    onDelete: 'SET NULL',
    nullable: true,
  })
  user?: User | null;

  @Column({ name: 'session_id', nullable: true })
  sessionId?: string;

  @ManyToOne(() => UploadedImage, (image) => image.generationJobs, {
    eager: true,
    nullable: true,
    onDelete: 'SET NULL',
  })
  uploadedImage?: UploadedImage | null;

  @Column({ name: 'grid_config_id' })
  gridConfigId!: string;

  @Column({ name: 'variation_count', type: 'int', default: 1 })
  variationCount!: number;

  @Column({ type: 'varchar', length: 50, default: 'pending' })
  status!: GenerationJobStatus;

  @Column({ name: 'error_message', type: 'text', nullable: true })
  errorMessage?: string;

  @Column({ name: 'started_at', type: 'timestamptz', nullable: true })
  startedAt?: Date;

  @Column({ name: 'completed_at', type: 'timestamptz', nullable: true })
  completedAt?: Date;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;

  @OneToMany(() => GeneratedImage, (image) => image.generationJob, {
    cascade: true,
  })
  generatedImages!: GeneratedImage[];
}
