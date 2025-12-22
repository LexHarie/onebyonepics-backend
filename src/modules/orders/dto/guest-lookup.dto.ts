import { IsString, IsEmail, MinLength } from 'class-validator';

export class GuestOrderLookupDto {
  @IsString()
  @MinLength(10, { message: 'Invalid order number format' })
  orderNumber!: string;

  @IsEmail({}, { message: 'Please provide a valid email address' })
  customerEmail!: string;
}
