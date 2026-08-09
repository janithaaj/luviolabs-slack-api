import {
  IsIn,
  IsOptional,
  IsString,
  Length,
  Matches,
  MaxLength,
} from 'class-validator';

export class CreateChannelDto {
  @IsString() @Length(1, 80) name!: string;
  @IsString()
  @Length(1, 80)
  @Matches(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
  slug!: string;
  @IsOptional() @IsString() @MaxLength(500) description?: string;
  @IsIn(['PUBLIC', 'PRIVATE']) type!: 'PUBLIC' | 'PRIVATE';
}
