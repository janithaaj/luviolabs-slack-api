import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Schema as MongooseSchema, Types } from 'mongoose';

export type ProjectActivityDocument = HydratedDocument<ProjectActivity>;

@Schema({ timestamps: { createdAt: true, updatedAt: false }, versionKey: false })
export class ProjectActivity {
  @Prop({ type: MongooseSchema.Types.ObjectId, required: true, index: true })
  workspaceId!: Types.ObjectId;

  @Prop({ type: MongooseSchema.Types.ObjectId, required: true, index: true })
  projectId!: Types.ObjectId;

  @Prop({ type: MongooseSchema.Types.ObjectId })
  actorId?: Types.ObjectId;

  @Prop({ required: true })
  type!: string;

  @Prop({
    enum: ['PROJECT', 'TASK', 'MESSAGE', 'MEETING', 'FILE', 'DECISION', 'MEMBER', 'SPRINT'],
    required: true,
  })
  entityType!:
    | 'PROJECT'
    | 'TASK'
    | 'MESSAGE'
    | 'MEETING'
    | 'FILE'
    | 'DECISION'
    | 'MEMBER'
    | 'SPRINT';

  @Prop({ type: MongooseSchema.Types.ObjectId, required: true })
  entityId!: Types.ObjectId;

  @Prop({ type: Object, default: {} })
  metadata!: Record<string, unknown>;

  createdAt!: Date;
}

export const ProjectActivitySchema = SchemaFactory.createForClass(ProjectActivity);
ProjectActivitySchema.index({ projectId: 1, createdAt: -1 });
ProjectActivitySchema.index({ workspaceId: 1, createdAt: -1 });
