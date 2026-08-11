import {
  IsArray,
  IsObject,
  IsOptional,
  IsString,
  Length,
  MaxLength,
  ValidateIf,
} from 'class-validator';

export class CreateMessageDto {
  /** Legacy markdown/plain — required when contentJson is absent */
  @ValidateIf((body: CreateMessageDto) => !body.contentJson && !body.plainText)
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
  @IsString()
  @MaxLength(120)
  clientId?: string;

  @IsOptional()
  @IsString()
  @Length(24, 24)
  replyToMessageId?: string;

  @IsOptional()
  @IsString()
  @Length(24, 24)
  threadRootId?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  attachmentIds?: string[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  mentionUserIds?: string[];
}
