import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Schema as MongooseSchema, Types } from 'mongoose';

export type TaskDocument = HydratedDocument<Task>;
/** Column id on the project board (builtin or custom). */
export type TaskStatus = string;
export type TaskPriority = 'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT';
export type TaskSourceType = 'MANUAL' | 'MESSAGE' | 'MEETING' | 'DECISION';
export const BUILTIN_TASK_STATUSES = [
  'TODO',
  'IN_PROGRESS',
  'IN_REVIEW',
  'BLOCKED',
  'DONE',
  'CANCELLED',
  'OPEN',
] as const;

@Schema({ _id: false })
export class TaskSource {
  @Prop({
    required: true,
    enum: ['MANUAL', 'MESSAGE', 'MEETING', 'DECISION'],
  })
  type!: TaskSourceType;

  @Prop({ type: MongooseSchema.Types.ObjectId })
  entityId?: Types.ObjectId;
}

export const TaskSourceSchema = SchemaFactory.createForClass(TaskSource);

@Schema({ timestamps: true, versionKey: false })
export class Task {
  @Prop({ type: MongooseSchema.Types.ObjectId, required: true, index: true })
  workspaceId!: Types.ObjectId;

  @Prop({ type: MongooseSchema.Types.ObjectId, index: true })
  projectId?: Types.ObjectId;

  @Prop()
  taskNumber?: number;

  @Prop()
  taskKey?: string;

  @Prop({ type: MongooseSchema.Types.ObjectId, required: true })
  createdBy!: Types.ObjectId;

  @Prop({ required: true, maxlength: 500 })
  title!: string;

  @Prop({ maxlength: 5000 })
  description?: string;

  @Prop({ type: Object })
  descriptionJson?: unknown;

  @Prop({ maxlength: 5000 })
  descriptionPlainText?: string;

  @Prop({ type: [MongooseSchema.Types.ObjectId], default: [] })
  assigneeIds!: Types.ObjectId[];

  /** @deprecated Prefer assigneeIds */
  @Prop({ type: MongooseSchema.Types.ObjectId })
  assigneeId?: Types.ObjectId;

  @Prop()
  startDate?: Date;

  @Prop()
  dueDate?: Date;

  @Prop()
  completedAt?: Date;

  @Prop()
  estimatedMinutes?: number;

  @Prop({ type: MongooseSchema.Types.ObjectId })
  parentTaskId?: Types.ObjectId;

  @Prop({ type: MongooseSchema.Types.ObjectId })
  conversationId?: Types.ObjectId;

  @Prop({ enum: ['LOW', 'MEDIUM', 'HIGH', 'URGENT'], default: 'MEDIUM' })
  priority!: TaskPriority;

  /** Project work type id (TASK, BUG, FEATURE, STORY, or custom). */
  @Prop({ default: 'TASK', maxlength: 64, index: true })
  issueType!: string;

  @Prop({ type: MongooseSchema.Types.ObjectId, index: true })
  sprintId?: Types.ObjectId;

  /** Kanban: false keeps the work item in the backlog, off the board. */
  @Prop({ default: true, index: true })
  onBoard!: boolean;

  /** Matches a project board column id (or CANCELLED). */
  @Prop({ required: true, default: 'TODO', maxlength: 64, index: true })
  status!: TaskStatus;

  @Prop({ type: TaskSourceSchema })
  source?: TaskSource;

  @Prop({ type: MongooseSchema.Types.ObjectId })
  sourceMessageId?: Types.ObjectId;

  @Prop({ type: MongooseSchema.Types.ObjectId })
  sourceConversationId?: Types.ObjectId;

  @Prop({ default: false })
  isDecision!: boolean;

  @Prop({ default: 1000 })
  sortOrder!: number;

  @Prop()
  deletedAt?: Date;

  createdAt!: Date;
  updatedAt!: Date;
}

export const TaskSchema = SchemaFactory.createForClass(Task);
TaskSchema.index({ workspaceId: 1, createdAt: -1 });
TaskSchema.index({ projectId: 1, status: 1, sortOrder: 1 });
TaskSchema.index({ projectId: 1, sprintId: 1, sortOrder: 1 });
TaskSchema.index({ projectId: 1, onBoard: 1, sortOrder: 1 });
TaskSchema.index({ projectId: 1, dueDate: 1 });
TaskSchema.index({ workspaceId: 1, assigneeIds: 1, status: 1 });
TaskSchema.index({ workspaceId: 1, projectId: 1, createdAt: -1 });
TaskSchema.index(
  { projectId: 1, taskNumber: 1 },
  {
    unique: true,
    partialFilterExpression: {
      projectId: { $exists: true },
      taskNumber: { $type: 'number' },
    },
  },
);
