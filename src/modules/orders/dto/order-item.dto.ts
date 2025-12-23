import { IsInt, IsObject, IsString, Min } from 'class-validator';

export class CreateOrderItemDto {
  @IsString()
  gridConfigId!: string;

  @IsString()
  generationJobId!: string;

  @IsObject()
  tileAssignments!: Record<number, number>;

  @IsInt()
  @Min(1)
  quantity!: number;
}
