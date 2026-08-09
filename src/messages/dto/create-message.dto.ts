import { IsOptional, IsString, Length, MaxLength } from 'class-validator';

export class CreateMessageDto {
  @IsString() @Length(1, 40_000) text!: string;
  @IsOptional() @IsString() @MaxLength(120) clientId?: string;
  @IsOptional() @IsString() @Length(24, 24) replyToMessageId?: string;
}
