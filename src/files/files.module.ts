import { Module, forwardRef } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { PermissionsModule } from '../permissions/permissions.module';
import { ProjectsModule } from '../projects/projects.module';
import { FilesController } from './files.controller';
import { FilesService } from './files.service';
import { ProjectFilesController } from './project-files.controller';
import { FileAsset, FileAssetSchema } from './schemas/file-asset.schema';

@Module({
  imports: [
    MongooseModule.forFeature([{ name: FileAsset.name, schema: FileAssetSchema }]),
    PermissionsModule,
    forwardRef(() => ProjectsModule),
  ],
  controllers: [FilesController, ProjectFilesController],
  providers: [FilesService],
  exports: [FilesService],
})
export class FilesModule {}
