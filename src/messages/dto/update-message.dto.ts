import { IsObject, IsOptional, IsString, Length, MaxLength, ValidateIf } from 'class-validator';

export class UpdateMessageDto {
  @ValidateIf((body: UpdateMessageDto) => !body.contentJson && !body.plainText)
  @IsString()
  @Length(1, 40_000)
  text?: string;

  @IsOptional()
  @IsObject()
  contentJson?: Record<string, unknown>;

  @IsOptional()
  @IsString()
  @MaxLength(40_000)
  plainText?: string;

  @IsOptional()
  @IsString({ each: true })
  mentionUserIds?: string[];
}
