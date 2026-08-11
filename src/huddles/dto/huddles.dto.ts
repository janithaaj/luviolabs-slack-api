import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsMongoId,
  IsOptional,
  Max,
  Min,
} from 'class-validator';

export class StartHuddleDto {
  @IsMongoId() workspaceId!: string;
  @IsMongoId() conversationId!: string;
}

export class InviteHuddleDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(50)
  @IsMongoId({ each: true })
  userIds!: string[];
}

export class HuddleRoomDto {
  @IsMongoId() huddleId!: string;
}

export class HuddleParticipantStateDto extends HuddleRoomDto {
  @IsOptional() @IsBoolean() muted?: boolean;
  @IsOptional() @IsBoolean() videoEnabled?: boolean;
  @IsOptional() @IsBoolean() screenSharing?: boolean;
  @IsOptional() @IsBoolean() handRaised?: boolean;
}

export class HuddleReactionDto extends HuddleRoomDto {
  @IsIn(['👍', '❤️', '😂', '👏', '🎉', '✋']) emoji!: string;
}

export class HuddleHistoryQueryDto {
  @IsOptional() @IsMongoId() cursor?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(50) limit = 20;
}
