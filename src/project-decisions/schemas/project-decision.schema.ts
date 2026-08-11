import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Schema as MongooseSchema, Types } from 'mongoose';

export type ProjectDecisionDocument = HydratedDocument<ProjectDecision>;

@Schema({ timestamps: true, versionKey: false })
export class ProjectDecision {
  @Prop({ type: MongooseSchema.Types.ObjectId, required: true, index: true })
  workspaceId!: Types.ObjectId;

  @Prop({ type: MongooseSchema.Types.ObjectId, required: true, index: true })
  projectId!: Types.ObjectId;

  @Prop({ required: true, maxlength: 500 })
  title!: string;

  @Prop({ maxlength: 5000 })
  description?: string;

  @Prop({ type: MongooseSchema.Types.ObjectId })
  sourceMessageId?: Types.ObjectId;

  @Prop({ type: MongooseSchema.Types.ObjectId })
  sourceConversationId?: Types.ObjectId;

  @Prop({ type: MongooseSchema.Types.ObjectId })
  sourceMeetingId?: Types.ObjectId;

  @Prop({ type: MongooseSchema.Types.ObjectId, required: true })
  createdBy!: Types.ObjectId;

  @Prop({ default: Date.now })
  decidedAt!: Date;

  @Prop()
  deletedAt?: Date;

  createdAt!: Date;
  updatedAt!: Date;
}

export const ProjectDecisionSchema = SchemaFactory.createForClass(ProjectDecision);
ProjectDecisionSchema.index({ projectId: 1, decidedAt: -1 });
