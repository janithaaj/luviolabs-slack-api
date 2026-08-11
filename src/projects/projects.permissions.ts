export type ProjectRole = 'PROJECT_MANAGER' | 'MEMBER' | 'VIEWER';

export const projectPermissions = [
  'project.view',
  'project.edit',
  'project.member.add',
  'project.member.remove',
  'project.complete',
  'project.archive',
  'task.create',
  'task.assign',
  'task.edit',
  'task.edit_own',
  'task.delete',
  'task.comment',
  'decision.create',
  'meeting.create',
  'chat.send',
  'chat.read',
  'file.upload',
  'file.read',
] as const;

export type ProjectPermission = (typeof projectPermissions)[number];

export const projectRolePermissions: Record<
  ProjectRole,
  ReadonlySet<ProjectPermission>
> = {
  PROJECT_MANAGER: new Set(projectPermissions),
  MEMBER: new Set([
    'project.view',
    'chat.send',
    'chat.read',
    'task.create',
    'task.edit_own',
    'task.comment',
    'file.upload',
    'file.read',
    'meeting.create',
    'decision.create',
  ]),
  VIEWER: new Set([
    'project.view',
    'chat.read',
    'file.read',
  ]),
};
