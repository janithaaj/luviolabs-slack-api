import { IsString, Length, Matches } from 'class-validator';

export class CreateWorkspaceDto {
  @IsString() @Length(2, 120) name!: string;
  @IsString()
  @Length(2, 80)
  @Matches(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
  slug!: string;
}
