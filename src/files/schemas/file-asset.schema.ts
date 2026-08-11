import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Schema as MongooseSchema, Types } from 'mongoose';

export type FileAssetDocument = HydratedDocument<FileAsset>;

@Schema({ timestamps: true, versionKey: false })
export class FileAsset {
  @Prop({ type: MongooseSchema.Types.ObjectId, required: true, index: true })
  workspaceId!: Types.ObjectId;
  @Prop({ type: MongooseSchema.Types.ObjectId, required: true, index: true })
  uploadedBy!: Types.ObjectId;
  @Prop({ type: MongooseSchema.Types.ObjectId, index: true })
  projectId?: Types.ObjectId;
  @Prop({ type: MongooseSchema.Types.ObjectId, index: true })
  taskId?: Types.ObjectId;
  @Prop({ type: MongooseSchema.Types.ObjectId, index: true })
  meetingId?: Types.ObjectId;
  @Prop({ type: MongooseSchema.Types.ObjectId, index: true })
  messageId?: Types.ObjectId;
  @Prop({ type: MongooseSchema.Types.ObjectId, index: true })
  conversationId?: Types.ObjectId;
  @Prop({ required: true }) storageKey!: string;
  @Prop({ default: 'LOCAL' }) storageProvider!: 'LOCAL' | 'S3';
  @Prop({ required: true }) originalName!: string;
  @Prop({ required: true }) mimeType!: string;
  @Prop() extension?: string;
  @Prop({ required: true }) size!: number;
  @Prop() width?: number;
  @Prop() height?: number;
  @Prop() duration?: number;
  @Prop() thumbnailKey?: string;
  @Prop({
    required: true,
    enum: ['PENDING', 'UPLOADING', 'PROCESSING', 'READY', 'FAILED', 'QUARANTINED'],
    default: 'PENDING',
  })
  status!:
    | 'PENDING'
    | 'UPLOADING'
    | 'PROCESSING'
    | 'READY'
    | 'FAILED'
    | 'QUARANTINED';
  createdAt!: Date;
  updatedAt!: Date;
}

export const FileAssetSchema = SchemaFactory.createForClass(FileAsset);
