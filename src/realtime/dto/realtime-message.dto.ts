import {
  IsArray,
  IsBoolean,
  IsObject,
  IsOptional,
  IsString,
  Length,
  MaxLength,
  ValidateIf,
} from 'class-validator';

export class RealtimeMessageDto {
  @IsString() @Length(24, 24) workspaceId!: string;
  @IsString() @Length(24, 24) conversationId!: string;

  @ValidateIf((body: RealtimeMessageDto) => !body.contentJson && !body.plainText)
  @IsString()
  @Length(1, 40_000)
  text?: string;

  @IsOptional() @IsObject() contentJson?: Record<string, unknown>;
  @IsOptional() @IsString() @MaxLength(40_000) plainText?: string;
  @IsString() @MaxLength(120) clientId!: string;
  @IsOptional() @IsString() @Length(24, 24) replyToMessageId?: string;
  @IsOptional() @IsString() @Length(24, 24) threadRootId?: string;
  @IsOptional() @IsArray() @IsString({ each: true }) attachmentIds?: string[];
  @IsOptional() @IsArray() @IsString({ each: true }) mentionUserIds?: string[];
}

export class RealtimeEditMessageDto {
  @IsString() @Length(24, 24) workspaceId!: string;
  @IsString() @Length(24, 24) conversationId!: string;
  @IsString() @Length(24, 24) messageId!: string;
  @IsOptional() @IsObject() contentJson?: Record<string, unknown>;
  @IsOptional() @IsString() @MaxLength(40_000) plainText?: string;
  @IsOptional() @IsString() @Length(1, 40_000) text?: string;
}

export class RealtimeDeleteMessageDto {
  @IsString() @Length(24, 24) workspaceId!: string;
  @IsString() @Length(24, 24) conversationId!: string;
  @IsString() @Length(24, 24) messageId!: string;
}

export class RealtimeReactionDto {
  @IsString() @Length(24, 24) workspaceId!: string;
  @IsString() @Length(24, 24) conversationId!: string;
  @IsString() @Length(24, 24) messageId!: string;
  @IsString() @MaxLength(32) emoji!: string;
}

export class JoinConversationDto {
  @IsString() @Length(24, 24) workspaceId!: string;
  @IsString() @Length(24, 24) conversationId!: string;
}

export class JoinProjectDto {
  @IsString() @Length(24, 24) projectId!: string;
}

export class WorkspacePresenceDto {
  @IsString() @Length(24, 24) workspaceId!: string;
}

export class TypingIndicatorDto extends JoinConversationDto {
  @IsBoolean() active!: boolean;
}
