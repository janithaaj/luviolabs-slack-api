import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { MongooseModule } from '@nestjs/mongoose';
import { ThrottlerModule } from '@nestjs/throttler';
import { APP_FILTER, APP_GUARD } from '@nestjs/core';
import { ThrottlerGuard } from '@nestjs/throttler';
import { LoggerModule } from 'nestjs-pino';
import { validateEnvironment } from './config/environment';
import { AuthModule } from './auth/auth.module';
import { ChannelsModule } from './channels/channels.module';
import { ConversationsModule } from './conversations/conversations.module';
import { HealthModule } from './health/health.module';
import { MessagesModule } from './messages/messages.module';
import { PermissionsModule } from './permissions/permissions.module';
import { RealtimeModule } from './realtime/realtime.module';
import { RedisModule } from './redis/redis.module';
import { UsersModule } from './users/users.module';
import { WorkspacesModule } from './workspaces/workspaces.module';
import { ApiExceptionFilter } from './common/http/api-exception.filter';
import { HuddlesModule } from './huddles/huddles.module';
import { FilesModule } from './files/files.module';
import { TasksModule } from './tasks/tasks.module';
import { ProjectActivityModule } from './project-activity/project-activity.module';
import { ProjectDecisionsModule } from './project-decisions/project-decisions.module';
import { ProjectsModule } from './projects/projects.module';
import { SprintsModule } from './sprints/sprints.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, validate: validateEnvironment }),
    LoggerModule.forRoot({
      pinoHttp: {
        genReqId: (request, response) => {
          const incoming = request.headers['x-request-id'];
          const requestId =
            typeof incoming === 'string' ? incoming : crypto.randomUUID();
          response.setHeader('x-request-id', requestId);
          return requestId;
        },
        redact: [
          'req.headers.authorization',
          'req.headers.cookie',
          'req.body.password',
          'req.body.refreshToken',
        ],
        transport:
          process.env.NODE_ENV === 'production'
            ? undefined
            : { target: 'pino-pretty' },
      },
    }),
    ThrottlerModule.forRoot([{ ttl: 60_000, limit: 120 }]),
    MongooseModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        uri: config.getOrThrow<string>('MONGODB_URI'),
      }),
    }),
    RedisModule,
    HealthModule,
    UsersModule,
    AuthModule,
    WorkspacesModule,
    PermissionsModule,
    ChannelsModule,
    ConversationsModule,
    MessagesModule,
    FilesModule,
    ProjectActivityModule,
    ProjectsModule,
    SprintsModule,
    ProjectDecisionsModule,
    TasksModule,
    HuddlesModule,
    RealtimeModule,
  ],
  providers: [
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_FILTER, useClass: ApiExceptionFilter },
  ],
})
export class AppModule {}
