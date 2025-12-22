import { IsIn, IsOptional, IsString } from 'class-validator';

export class UpdatePaymentStatusDto {
  @IsIn(['pending', 'paid', 'failed', 'refunded'])
  status!: string;

  @IsOptional()
  @IsString()
  mayaPaymentId?: string;
}
