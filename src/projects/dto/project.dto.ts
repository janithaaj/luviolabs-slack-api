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
  Min,
  ValidateIf,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

export class WorkTypeDto {
  @IsString()
  @Length(1, 64)
  id!: string;

  @IsString()
  @Length(1, 80)
  name!: string;

  @IsString()
  @MaxLength(32)
  color!: string;

  @IsEnum(['bug', 'feature', 'story', 'task', 'custom'])
  icon!: 'bug' | 'feature' | 'story' | 'task' | 'custom';

  @IsOptional()
  @IsBoolean()
  builtin?: boolean;

  @IsOptional()
  @IsNumber()
  sortOrder?: number;
}

export class BoardColumnDto {
  @IsString()
  @Length(1, 64)
  id!: string;

  @IsString()
  @Length(1, 80)
  name!: string;

  @IsEnum(['TODO', 'IN_PROGRESS', 'IN_REVIEW', 'BLOCKED', 'DONE'])
  category!: 'TODO' | 'IN_PROGRESS' | 'IN_REVIEW' | 'BLOCKED' | 'DONE';

  @IsOptional()
  sortOrder?: number;

  @IsOptional()
  @IsString()
  @MaxLength(32)
  color?: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  wipLimit?: number;
}

export class CreateProjectDto {
  @IsString()
  @Length(2, 120)
  name!: string;

  @IsOptional()
  @IsString()
  @MaxLength(12)
  key?: string;

  @IsOptional()
  @IsString()
  @MaxLength(5000)
  description?: string;

  @IsOptional()
  @IsString()
  @Length(24, 24)
  ownerId?: string;

  @IsOptional()
  @IsArray()
  memberIds?: string[];

  @IsOptional()
  @IsDateString()
  startDate?: string;

  @IsOptional()
  @IsDateString()
  targetDate?: string;

  @IsOptional()
  @IsEnum(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'])
  priority?: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';

  @IsOptional()
  @IsEnum(['KANBAN', 'SCRUM'])
  boardType?: 'KANBAN' | 'SCRUM';
}

export class UpdateProjectDto {
  @IsOptional()
  @IsString()
  @Length(2, 120)
  name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(5000)
  description?: string;

  @IsOptional()
  @IsEnum(['PLANNING', 'ACTIVE', 'ON_HOLD', 'COMPLETED', 'ARCHIVED'])
  status?: 'PLANNING' | 'ACTIVE' | 'ON_HOLD' | 'COMPLETED' | 'ARCHIVED';

  @IsOptional()
  @IsEnum(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'])
  priority?: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';

  @IsOptional()
  @IsEnum(['ON_TRACK', 'AT_RISK', 'OFF_TRACK'])
  health?: 'ON_TRACK' | 'AT_RISK' | 'OFF_TRACK';

  @IsOptional()
  @IsEnum(['KANBAN', 'SCRUM'])
  boardType?: 'KANBAN' | 'SCRUM';

  @IsOptional()
  @IsString()
  @Length(24, 24)
  ownerId?: string;

  @IsOptional()
  @IsDateString()
  startDate?: string;

  @IsOptional()
  @IsDateString()
  targetDate?: string;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => BoardColumnDto)
  boardColumns?: BoardColumnDto[];

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => WorkTypeDto)
  workTypes?: WorkTypeDto[];
}

export class AddBoardColumnDto {
  @IsString()
  @Length(1, 80)
  name!: string;

  @IsEnum(['TODO', 'IN_PROGRESS', 'IN_REVIEW', 'BLOCKED', 'DONE'])
  category!: 'TODO' | 'IN_PROGRESS' | 'IN_REVIEW' | 'BLOCKED' | 'DONE';

  @IsOptional()
  @IsString()
  @MaxLength(32)
  color?: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  wipLimit?: number;
}

export class UpdateBoardColumnDto {
  @IsOptional()
  @IsString()
  @Length(1, 80)
  name?: string;

  @IsOptional()
  @IsEnum(['TODO', 'IN_PROGRESS', 'IN_REVIEW', 'BLOCKED', 'DONE'])
  category?: 'TODO' | 'IN_PROGRESS' | 'IN_REVIEW' | 'BLOCKED' | 'DONE';

  @IsOptional()
  sortOrder?: number;

  @IsOptional()
  @IsString()
  @MaxLength(32)
  color?: string;

  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsNumber()
  @Min(0)
  wipLimit?: number | null;
}

export class RemoveBoardColumnDto {
  @IsString()
  @Length(1, 64)
  moveTasksToColumnId!: string;
}

export class AddProjectMemberDto {
  @IsString()
  @Length(24, 24)
  userId!: string;

  @IsOptional()
  @IsEnum(['PROJECT_MANAGER', 'MEMBER', 'VIEWER'])
  role?: 'PROJECT_MANAGER' | 'MEMBER' | 'VIEWER';
}

export class UpdateProjectMemberDto {
  @IsEnum(['PROJECT_MANAGER', 'MEMBER', 'VIEWER'])
  role!: 'PROJECT_MANAGER' | 'MEMBER' | 'VIEWER';
}
