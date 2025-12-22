import { IsInt, IsOptional, Min } from 'class-validator';

export class WebhooksQueryDto {
  @IsOptional()
  @IsInt()
  @Min(1)
  limit?: number;
}
