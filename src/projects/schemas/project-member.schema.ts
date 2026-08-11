import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Schema as MongooseSchema, Types } from 'mongoose';

export type ProjectMemberDocument = HydratedDocument<ProjectMember>;
export type ProjectRole = 'PROJECT_MANAGER' | 'MEMBER' | 'VIEWER';

@Schema({ timestamps: true, versionKey: false })
export class ProjectMember {
  @Prop({ type: MongooseSchema.Types.ObjectId, required: true, index: true })
  workspaceId!: Types.ObjectId;

  @Prop({ type: MongooseSchema.Types.ObjectId, required: true, index: true })
  projectId!: Types.ObjectId;

  @Prop({ type: MongooseSchema.Types.ObjectId, required: true, index: true })
  userId!: Types.ObjectId;

  @Prop({
    enum: ['PROJECT_MANAGER', 'MEMBER', 'VIEWER'],
    default: 'MEMBER',
  })
  role!: ProjectRole;

  @Prop({ type: MongooseSchema.Types.ObjectId, required: true })
  addedBy!: Types.ObjectId;

  @Prop({ default: Date.now })
  joinedAt!: Date;

  @Prop()
  removedAt?: Date;

  createdAt!: Date;
  updatedAt!: Date;
}

export const ProjectMemberSchema = SchemaFactory.createForClass(ProjectMember);
ProjectMemberSchema.index(
  { projectId: 1, userId: 1 },
  { unique: true },
);
ProjectMemberSchema.index({ userId: 1, projectId: 1 });
ProjectMemberSchema.index({ workspaceId: 1, userId: 1 });
