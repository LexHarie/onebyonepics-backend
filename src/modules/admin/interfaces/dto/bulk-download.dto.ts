import { ArrayMinSize, IsArray, IsUUID } from 'class-validator';

export class BulkDownloadDto {
  @IsArray()
  @IsUUID('4', { each: true })
  @ArrayMinSize(1)
  orderIds!: string[];
}
