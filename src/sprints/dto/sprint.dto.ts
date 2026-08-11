import {
  IsDateString,
  IsEnum,
  IsOptional,
  IsString,
  Length,
  MaxLength,
} from 'class-validator';

export class CreateSprintDto {
  @IsOptional()
  @IsString()
  @Length(1, 120)
  name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  goal?: string;
}

export class UpdateSprintDto {
  @IsOptional()
  @IsString()
  @Length(1, 120)
  name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  goal?: string | null;

  @IsOptional()
  @IsDateString()
  startDate?: string | null;

  @IsOptional()
  @IsDateString()
  endDate?: string | null;
}

export class StartSprintDto {
  @IsDateString()
  startDate!: string;

  @IsDateString()
  endDate!: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  goal?: string;
}

export class CompleteSprintDto {
  @IsOptional()
  @IsEnum(['BACKLOG'])
  moveIncompleteTo?: 'BACKLOG';

  @IsOptional()
  @IsString()
  @Length(24, 24)
  nextSprintId?: string;
}
