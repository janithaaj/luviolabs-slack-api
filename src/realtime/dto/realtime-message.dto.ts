import { IsBoolean, IsString, Length, MaxLength } from 'class-validator';

export class RealtimeMessageDto {
  @IsString() @Length(24, 24) workspaceId!: string;
  @IsString() @Length(24, 24) conversationId!: string;
  @IsString() @Length(1, 40_000) text!: string;
  @IsString() @MaxLength(120) clientId!: string;
}

export class JoinConversationDto {
  @IsString() @Length(24, 24) workspaceId!: string;
  @IsString() @Length(24, 24) conversationId!: string;
}

export class WorkspacePresenceDto {
  @IsString() @Length(24, 24) workspaceId!: string;
}

export class TypingIndicatorDto extends JoinConversationDto {
  @IsBoolean() active!: boolean;
}
