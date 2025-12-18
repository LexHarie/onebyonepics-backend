import {
  IsString,
  IsEmail,
  IsObject,
  IsOptional,
  MinLength,
  Matches,
  IsIn,
  IsBoolean,
  ValidateIf,
} from 'class-validator';
import type { DeliveryZone } from '../../domain/entities/order.entity';

export class CreateOrderDto {
  @IsString()
  generationJobId!: string;

  @IsString()
  gridConfigId!: string;

  @IsObject()
  tileAssignments!: Record<number, number>;

  // Customer info
  @IsString()
  @MinLength(2)
  customerName!: string;

  @IsEmail()
  customerEmail!: string;

  @IsString()
  @Matches(/^09\d{9}$/, { message: 'Phone must be a valid Philippine mobile number (09XXXXXXXXX)' })
  customerPhone!: string;

  // Address
  @ValidateIf((o) => !o.isDigitalOnly)
  @IsString()
  @MinLength(5)
  streetAddress!: string;

  @ValidateIf((o) => !o.isDigitalOnly)
  @IsString()
  @MinLength(2)
  barangay!: string;

  @ValidateIf((o) => !o.isDigitalOnly)
  @IsString()
  @MinLength(2)
  city!: string;

  @ValidateIf((o) => !o.isDigitalOnly)
  @IsString()
  @MinLength(2)
  province!: string;

  @ValidateIf((o) => !o.isDigitalOnly)
  @IsString()
  @Matches(/^\d{4}$/, { message: 'Postal code must be 4 digits' })
  postalCode!: string;

  @IsString()
  @IsIn(['cebu-city', 'outside-cebu', 'digital-only'])
  deliveryZone!: DeliveryZone;

  @IsOptional()
  @IsString()
  sessionId?: string;

  // Digital only order (no print)
  @IsOptional()
  @IsBoolean()
  isDigitalOnly?: boolean;
}
