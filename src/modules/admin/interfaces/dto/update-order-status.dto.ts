import { IsIn } from 'class-validator';

export class UpdateOrderStatusDto {
  @IsIn(['pending', 'processing', 'shipped', 'delivered', 'cancelled'])
  status!: string;
}
