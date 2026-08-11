import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  Post,
  Put,
  StreamableFile,
  UseGuards,
} from '@nestjs/common';
import { createReadStream } from 'fs';
import type { AuthenticatedUser } from '../common/authenticated-user';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { FilesService } from './files.service';

@UseGuards(JwtAuthGuard)
@Controller('workspaces/:workspaceId/files')
export class FilesController {
  constructor(private readonly files: FilesService) {}

  @Post('upload-session')
  async createSession(
    @CurrentUser() user: AuthenticatedUser,
    @Param('workspaceId') workspaceId: string,
    @Body()
    body: { originalName: string; mimeType: string; size: number },
  ) {
    return {
      data: await this.files.createUploadSession(user.userId, workspaceId, body),
      meta: {},
    };
  }

  @Post(':fileId/complete')
  async complete(
    @CurrentUser() user: AuthenticatedUser,
    @Param('workspaceId') workspaceId: string,
    @Param('fileId') fileId: string,
    @Body() body: { dataBase64: string; mimeType?: string },
  ) {
    if (!body?.dataBase64) throw new BadRequestException('Missing file payload');
    const buffer = Buffer.from(body.dataBase64, 'base64');
    return {
      data: await this.files.receiveUpload(
        user.userId,
        workspaceId,
        fileId,
        buffer,
        body.mimeType,
      ),
      meta: {},
    };
  }

  @Put(':fileId/upload')
  async uploadPut(
    @CurrentUser() user: AuthenticatedUser,
    @Param('workspaceId') workspaceId: string,
    @Param('fileId') fileId: string,
    @Body() body: { dataBase64: string; mimeType?: string },
  ) {
    if (!body?.dataBase64) throw new BadRequestException('Missing file payload');
    const buffer = Buffer.from(body.dataBase64, 'base64');
    return {
      data: await this.files.receiveUpload(
        user.userId,
        workspaceId,
        fileId,
        buffer,
        body.mimeType,
      ),
      meta: {},
    };
  }

  @Get(':fileId')
  async get(
    @CurrentUser() user: AuthenticatedUser,
    @Param('workspaceId') workspaceId: string,
    @Param('fileId') fileId: string,
  ) {
    return {
      data: await this.files.getFile(user.userId, workspaceId, fileId),
      meta: {},
    };
  }

  @Get(':fileId/download')
  async download(
    @CurrentUser() user: AuthenticatedUser,
    @Param('workspaceId') workspaceId: string,
    @Param('fileId') fileId: string,
  ) {
    const { absolutePath, file } = await this.files.getDownloadPath(
      user.userId,
      workspaceId,
      fileId,
    );
    const stream = createReadStream(absolutePath);
    return new StreamableFile(stream, {
      type: file.mimeType,
      disposition: `inline; filename="${encodeURIComponent(file.originalName)}"`,
    });
  }
}
