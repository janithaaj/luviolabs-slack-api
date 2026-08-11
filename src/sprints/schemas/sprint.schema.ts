import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Schema as MongooseSchema, Types } from 'mongoose';

export type SprintDocument = HydratedDocument<Sprint>;
export type SprintState = 'FUTURE' | 'ACTIVE' | 'CLOSED';

@Schema({ timestamps: true, versionKey: false })
export class Sprint {
  @Prop({ type: MongooseSchema.Types.ObjectId, required: true, index: true })
  workspaceId!: Types.ObjectId;

  @Prop({ type: MongooseSchema.Types.ObjectId, required: true, index: true })
  projectId!: Types.ObjectId;

  @Prop({ required: true, maxlength: 120 })
  name!: string;

  @Prop({ maxlength: 500 })
  goal?: string;

  @Prop()
  startDate?: Date;

  @Prop()
  endDate?: Date;

  @Prop({
    enum: ['FUTURE', 'ACTIVE', 'CLOSED'],
    default: 'FUTURE',
    index: true,
  })
  state!: SprintState;

  @Prop({ type: MongooseSchema.Types.ObjectId, required: true })
  createdBy!: Types.ObjectId;

  @Prop()
  startedAt?: Date;

  @Prop()
  completedAt?: Date;

  createdAt!: Date;
  updatedAt!: Date;
}

export const SprintSchema = SchemaFactory.createForClass(Sprint);
SprintSchema.index({ projectId: 1, state: 1, createdAt: -1 });
SprintSchema.index(
  { projectId: 1, state: 1 },
  {
    unique: true,
    partialFilterExpression: { state: 'ACTIVE' },
  },
);
