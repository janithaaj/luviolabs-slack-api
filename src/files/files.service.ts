import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectModel } from '@nestjs/mongoose';
import { createWriteStream, existsSync, mkdirSync } from 'fs';
import { join } from 'path';
import { Model, Types } from 'mongoose';
import { pipeline } from 'stream/promises';
import { Readable } from 'stream';
import { PermissionsService } from '../permissions/permissions.service';
import { FileAsset } from './schemas/file-asset.schema';

const IMAGE_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
]);
const VIDEO_TYPES = new Set(['video/mp4', 'video/webm', 'video/quicktime']);
const AUDIO_TYPES = new Set([
  'audio/mpeg',
  'audio/mp4',
  'audio/wav',
  'audio/webm',
]);
const DOC_TYPES = new Set([
  'application/pdf',
  'text/plain',
  'text/csv',
  'application/zip',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-powerpoint',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
]);

@Injectable()
export class FilesService {
  private readonly uploadRoot: string;

  constructor(
    @InjectModel(FileAsset.name) private readonly files: Model<FileAsset>,
    private readonly permissions: PermissionsService,
    private readonly config: ConfigService,
  ) {
    this.uploadRoot = join(process.cwd(), 'uploads');
    if (!existsSync(this.uploadRoot)) mkdirSync(this.uploadRoot, { recursive: true });
  }

  private maxSizeFor(mimeType: string) {
    if (IMAGE_TYPES.has(mimeType)) return 25 * 1024 * 1024;
    if (VIDEO_TYPES.has(mimeType)) return 250 * 1024 * 1024;
    if (AUDIO_TYPES.has(mimeType)) return 100 * 1024 * 1024;
    return 100 * 1024 * 1024;
  }

  private assertAllowedMime(mimeType: string) {
    if (
      IMAGE_TYPES.has(mimeType) ||
      VIDEO_TYPES.has(mimeType) ||
      AUDIO_TYPES.has(mimeType) ||
      DOC_TYPES.has(mimeType)
    ) {
      return;
    }
    throw new BadRequestException('Unsupported file type');
  }

  async createUploadSession(
    userId: string,
    workspaceId: string,
    input: { originalName: string; mimeType: string; size: number },
  ) {
    await this.permissions.requireMembership(userId, workspaceId);
    this.assertAllowedMime(input.mimeType);
    const maxSize = this.maxSizeFor(input.mimeType);
    if (input.size <= 0 || input.size > maxSize) {
      throw new BadRequestException(`File too large (max ${maxSize} bytes)`);
    }
    const fileId = new Types.ObjectId();
    const extension = input.originalName.includes('.')
      ? input.originalName.split('.').pop()?.toLowerCase()
      : undefined;
    const storageKey = `workspaces/${workspaceId}/${fileId.toString()}${extension ? `.${extension}` : ''}`;
    const file = await this.files.create({
      _id: fileId,
      workspaceId,
      uploadedBy: userId,
      storageKey,
      storageProvider: 'LOCAL',
      originalName: input.originalName.slice(0, 255),
      mimeType: input.mimeType,
      extension,
      size: input.size,
      status: 'PENDING',
    });
    const base = this.config.get<string>('APP_WEB_URL')?.replace(/\/$/, '') ?? '';
    // Clients PUT binary to the backend upload endpoint (local signed-upload stand-in).
    const apiBase =
      process.env.PUBLIC_API_URL?.replace(/\/$/, '') ||
      `http://127.0.0.1:${this.config.get('PORT') ?? 4000}`;
    return {
      fileId: file.id as string,
      uploadUrl: `${apiBase}/workspaces/${workspaceId}/files/${file.id}/upload`,
      expiresAt: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
      maxSize,
      meta: { note: base },
    };
  }

  async receiveUpload(
    userId: string,
    workspaceId: string,
    fileId: string,
    buffer: Buffer,
    contentType?: string,
  ) {
    await this.permissions.requireMembership(userId, workspaceId);
    const file = await this.files
      .findOne({ _id: fileId, workspaceId, uploadedBy: userId })
      .exec();
    if (!file) throw new NotFoundException('Upload session not found');
    if (file.status === 'READY') return file.toObject();
    if (buffer.byteLength > this.maxSizeFor(file.mimeType)) {
      file.status = 'FAILED';
      await file.save();
      throw new BadRequestException('File too large');
    }
    if (contentType && contentType !== file.mimeType) {
      // Allow slight mismatches from browsers but keep recorded mime as source of truth.
    }
    file.status = 'UPLOADING';
    await file.save();
    const absolute = join(this.uploadRoot, file.storageKey);
    mkdirSync(join(absolute, '..'), { recursive: true });
    await pipeline(Readable.from(buffer), createWriteStream(absolute));
    file.size = buffer.byteLength;
    file.status = 'READY';
    if (IMAGE_TYPES.has(file.mimeType)) {
      file.thumbnailKey = file.storageKey;
    }
    await file.save();
    return file.toObject();
  }

  async getFile(userId: string, workspaceId: string, fileId: string) {
    await this.permissions.requireMembership(userId, workspaceId);
    const file = await this.files.findOne({ _id: fileId, workspaceId }).lean().exec();
    if (!file || file.status === 'FAILED') throw new NotFoundException('File not found');
    return file;
  }

  async getDownloadPath(userId: string, workspaceId: string, fileId: string) {
    const file = await this.getFile(userId, workspaceId, fileId);
    if (file.status !== 'READY') throw new BadRequestException('File is not ready');
    return {
      absolutePath: join(this.uploadRoot, file.storageKey),
      file,
    };
  }

  async listByProject(projectId: string, kind?: string) {
    const query: Record<string, unknown> = {
      projectId,
      status: 'READY',
    };
    if (kind === 'images') {
      query.mimeType = { $regex: /^image\// };
    } else if (kind === 'videos') {
      query.mimeType = { $regex: /^video\// };
    } else if (kind === 'documents') {
      query.mimeType = {
        $in: [
          'application/pdf',
          'text/plain',
          'text/csv',
          'application/zip',
          'application/msword',
          'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
          'application/vnd.ms-excel',
          'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          'application/vnd.ms-powerpoint',
          'application/vnd.openxmlformats-officedocument.presentationml.presentation',
        ],
      };
    } else if (kind === 'other') {
      query.mimeType = {
        $not: { $regex: /^(image|video)\// },
        $nin: [
          'application/pdf',
          'text/plain',
          'text/csv',
          'application/zip',
          'application/msword',
          'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
          'application/vnd.ms-excel',
          'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          'application/vnd.ms-powerpoint',
          'application/vnd.openxmlformats-officedocument.presentationml.presentation',
        ],
      };
    }
    return this.files
      .find(query)
      .sort({ createdAt: -1 })
      .limit(200)
      .lean()
      .exec();
  }
}
