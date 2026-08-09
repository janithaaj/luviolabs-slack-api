export const permissions = [
  'workspace.manage',
  'workspace.invite_member',
  'workspace.remove_member',
  'channel.create',
  'channel.manage',
  'channel.archive',
  'message.create',
  'message.edit_own',
  'message.delete_own',
  'message.delete_any',
  'meeting.create',
  'meeting.start',
  'meeting.manage',
  'meeting.end',
  'file.upload',
] as const;

export type Permission = (typeof permissions)[number];
export type WorkspaceRole = 'OWNER' | 'ADMIN' | 'MEMBER';

export const rolePermissions: Record<WorkspaceRole, ReadonlySet<Permission>> = {
  OWNER: new Set(permissions),
  ADMIN: new Set(
    permissions.filter((permission) => permission !== 'workspace.manage'),
  ),
  MEMBER: new Set([
    'message.create',
    'message.edit_own',
    'message.delete_own',
    'meeting.create',
    'file.upload',
  ]),
};
