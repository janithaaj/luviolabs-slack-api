import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Schema as MongooseSchema, Types } from 'mongoose';
import {
  BoardColumn,
  BoardColumnSchema,
  DEFAULT_BOARD_COLUMNS,
} from './board-column.schema';
import {
  DEFAULT_WORK_TYPES,
  WorkType,
  WorkTypeSchema,
} from './work-type.schema';

export type ProjectDocument = HydratedDocument<Project>;
export type ProjectStatus =
  | 'PLANNING'
  | 'ACTIVE'
  | 'ON_HOLD'
  | 'COMPLETED'
  | 'ARCHIVED';
export type ProjectPriority = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
export type ProjectHealth = 'ON_TRACK' | 'AT_RISK' | 'OFF_TRACK';
export type ProjectBoardType = 'KANBAN' | 'SCRUM';
export { DEFAULT_BOARD_COLUMNS, DEFAULT_WORK_TYPES };
export type { BoardColumn, WorkType };

@Schema({ timestamps: true, versionKey: false })
export class Project {
  @Prop({ type: MongooseSchema.Types.ObjectId, required: true, index: true })
  workspaceId!: Types.ObjectId;

  @Prop({ required: true, maxlength: 120 })
  name!: string;

  @Prop({ maxlength: 12 })
  key?: string;

  @Prop({ required: true, maxlength: 140 })
  slug!: string;

  @Prop({ maxlength: 5000 })
  description?: string;

  @Prop({
    enum: ['PLANNING', 'ACTIVE', 'ON_HOLD', 'COMPLETED', 'ARCHIVED'],
    default: 'ACTIVE',
    index: true,
  })
  status!: ProjectStatus;

  @Prop({ enum: ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'], default: 'MEDIUM' })
  priority!: ProjectPriority;

  @Prop({ enum: ['ON_TRACK', 'AT_RISK', 'OFF_TRACK'], default: 'ON_TRACK' })
  health!: ProjectHealth;

  @Prop({ type: MongooseSchema.Types.ObjectId, required: true })
  ownerId!: Types.ObjectId;

  @Prop({ type: MongooseSchema.Types.ObjectId, required: true })
  createdBy!: Types.ObjectId;

  @Prop()
  startDate?: Date;

  @Prop()
  targetDate?: Date;

  @Prop()
  completedAt?: Date;

  @Prop()
  archivedAt?: Date;

  @Prop({ type: MongooseSchema.Types.ObjectId })
  defaultConversationId?: Types.ObjectId;

  @Prop()
  coverImageUrl?: string;

  @Prop({ default: 0 })
  nextTaskNumber!: number;

  @Prop({ type: [BoardColumnSchema], default: () => [...DEFAULT_BOARD_COLUMNS] })
  boardColumns!: BoardColumn[];

  @Prop({ type: [WorkTypeSchema], default: () => [...DEFAULT_WORK_TYPES] })
  workTypes!: WorkType[];

  @Prop({ enum: ['KANBAN', 'SCRUM'], default: 'KANBAN', index: true })
  boardType!: ProjectBoardType;

  createdAt!: Date;
  updatedAt!: Date;
}

export const ProjectSchema = SchemaFactory.createForClass(Project);
ProjectSchema.index({ workspaceId: 1, slug: 1 }, { unique: true });
ProjectSchema.index(
  { workspaceId: 1, key: 1 },
  {
    unique: true,
    partialFilterExpression: { key: { $type: 'string' } },
  },
);
ProjectSchema.index({ workspaceId: 1, status: 1, createdAt: -1 });
ProjectSchema.index({ ownerId: 1 });
