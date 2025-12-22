import { IsInt, IsOptional, IsString, Min } from 'class-validator';

export class AnalyticsRevenueQueryDto {
  @IsOptional()
  @IsString()
  period?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  range?: number;
}
