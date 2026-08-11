import {
  IsArray,
  IsBoolean,
  IsDateString,
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
  Length,
  MaxLength,
  ValidateIf,
} from 'class-validator';

export class CreateProjectTaskDto {
  @IsString()
  @Length(1, 500)
  title!: string;

  @IsOptional()
  @IsString()
  @MaxLength(5000)
  description?: string;

  @IsOptional()
  descriptionJson?: unknown;

  @IsOptional()
  @IsString()
  @MaxLength(5000)
  descriptionPlainText?: string;

  @IsOptional()
  @IsArray()
  assigneeIds?: string[];

  @IsOptional()
  @IsString()
  @Length(1, 64)
  status?: string;

  @IsOptional()
  @IsEnum(['LOW', 'MEDIUM', 'HIGH', 'URGENT'])
  priority?: 'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT';

  @IsOptional()
  @IsString()
  @Length(1, 64)
  issueType?: string;

  @IsOptional()
  @IsString()
  @Length(24, 24)
  sprintId?: string;

  @IsOptional()
  @IsBoolean()
  onBoard?: boolean;

  @IsOptional()
  @IsDateString()
  startDate?: string;

  @IsOptional()
  @IsDateString()
  dueDate?: string;

  @IsOptional()
  @IsString()
  @Length(24, 24)
  parentTaskId?: string;

  @IsOptional()
  @IsNumber()
  sortOrder?: number;
}

export class UpdateTaskDto {
  @IsOptional()
  @IsString()
  @Length(1, 500)
  title?: string;

  @IsOptional()
  @IsString()
  @MaxLength(5000)
  description?: string;

  @IsOptional()
  descriptionJson?: unknown;

  @IsOptional()
  @IsString()
  @MaxLength(5000)
  descriptionPlainText?: string;

  @IsOptional()
  @IsArray()
  assigneeIds?: string[];

  @IsOptional()
  @IsString()
  @Length(1, 64)
  status?: string;

  @IsOptional()
  @IsEnum(['LOW', 'MEDIUM', 'HIGH', 'URGENT'])
  priority?: 'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT';

  @IsOptional()
  @IsString()
  @Length(1, 64)
  issueType?: string;

  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsString()
  @Length(24, 24)
  sprintId?: string | null;

  @IsOptional()
  @IsBoolean()
  onBoard?: boolean;

  @IsOptional()
  @IsDateString()
  startDate?: string | null;

  @IsOptional()
  @IsDateString()
  dueDate?: string | null;

  @IsOptional()
  @IsNumber()
  sortOrder?: number;

  @IsOptional()
  @IsString()
  @Length(24, 24)
  parentTaskId?: string | null;
}

export class CreateTaskFromMessageDto {
  @IsOptional()
  @IsString()
  @Length(1, 500)
  title?: string;

  @IsOptional()
  @IsArray()
  assigneeIds?: string[];

  @IsOptional()
  @IsEnum(['LOW', 'MEDIUM', 'HIGH', 'URGENT'])
  priority?: 'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT';

  @IsOptional()
  @IsDateString()
  dueDate?: string;

  @IsOptional()
  @IsString()
  @Length(24, 24)
  projectId?: string;
}
