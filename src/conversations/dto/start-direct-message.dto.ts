import { IsMongoId } from 'class-validator';

export class StartDirectMessageDto {
  @IsMongoId()
  targetUserId!: string;
}
