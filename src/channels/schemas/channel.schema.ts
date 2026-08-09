import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Schema as MongooseSchema, Types } from 'mongoose';

export type ChannelDocument = HydratedDocument<Channel>;

@Schema({ timestamps: true, versionKey: false })
export class Channel {
  @Prop({ type: MongooseSchema.Types.ObjectId, required: true, index: true })
  workspaceId!: Types.ObjectId;
  @Prop({ required: true, trim: true, maxlength: 80 }) name!: string;
  @Prop({ required: true, lowercase: true }) slug!: string;
  @Prop({ maxlength: 500 }) description?: string;
  @Prop({ required: true, enum: ['PUBLIC', 'PRIVATE'] }) type!:
    'PUBLIC' | 'PRIVATE';
  @Prop({ type: MongooseSchema.Types.ObjectId, required: true })
  createdBy!: Types.ObjectId;
  @Prop() archivedAt?: Date;
  createdAt!: Date;
  updatedAt!: Date;
}

export const ChannelSchema = SchemaFactory.createForClass(Channel);
ChannelSchema.index({ workspaceId: 1, slug: 1 }, { unique: true });
