import { IsDateString, IsIn, IsOptional } from 'class-validator';
import { PaginationQueryDto } from './pagination.dto';

export class GenerationJobsQueryDto extends PaginationQueryDto {
  @IsOptional()
  @IsIn(['pending', 'processing', 'completed', 'failed'])
  status?: string;

  @IsOptional()
  @IsDateString()
  dateFrom?: string;

  @IsOptional()
  @IsDateString()
  dateTo?: string;
}
