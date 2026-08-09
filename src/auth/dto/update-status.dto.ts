import { IsISO8601, IsOptional, IsString, MaxLength } from 'class-validator';

export class UpdateStatusDto {
  @IsOptional()
  @IsString()
  @MaxLength(160)
  status?: string;

  @IsOptional()
  @IsISO8601()
  expiresAt?: string;
}
