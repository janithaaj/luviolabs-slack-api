import {
  Controller,
  Get,
  Inject,
  Param,
  Query,
  UseGuards,
  forwardRef,
} from '@nestjs/common';
import type { AuthenticatedUser } from '../common/authenticated-user';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { ProjectsService } from '../projects/projects.service';
import { FilesService } from './files.service';

@UseGuards(JwtAuthGuard)
@Controller('projects/:projectId/files')
export class ProjectFilesController {
  constructor(
    private readonly files: FilesService,
    @Inject(forwardRef(() => ProjectsService))
    private readonly projects: ProjectsService,
  ) {}

  @Get()
  async list(
    @CurrentUser() user: AuthenticatedUser,
    @Param('projectId') projectId: string,
    @Query('kind') kind?: string,
  ) {
    await this.projects.requireProjectAccess(user.userId, projectId, 'file.read');
    return {
      data: await this.files.listByProject(projectId, kind),
      meta: {},
    };
  }
}
