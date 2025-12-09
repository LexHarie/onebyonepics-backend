import {
  Column,
  CreateDateColumn,
  Entity,
  OneToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import type { RefreshToken } from '../../auth/entities/refresh-token.entity';
import type { UploadedImage } from '../../images/entities/image.entity';
import type { GenerationJob } from '../../generation/entities/generation-job.entity';

@Entity({ name: 'users' })
export class User {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ unique: true })
  email!: string;

  @Column({ name: 'password_hash' })
  passwordHash!: string;

  @Column({ nullable: true })
  name?: string;

  @Column({ name: 'is_verified', default: false })
  isVerified!: boolean;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt!: Date;

  @OneToMany('RefreshToken', 'user')
  refreshTokens!: RefreshToken[];

  @OneToMany('UploadedImage', 'user')
  uploadedImages!: UploadedImage[];

  @OneToMany('GenerationJob', 'user')
  generationJobs!: GenerationJob[];
}
