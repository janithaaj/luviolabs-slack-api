import { IsString, Length } from 'class-validator';

export class RefreshDto {
  @IsString() @Length(40, 500) refreshToken!: string;
  @IsString() @Length(1, 120) deviceName = 'Unknown device';
}
