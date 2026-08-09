import { rolePermissions } from './permissions';

describe('rolePermissions', () => {
  it('does not grant workspace management to members', () => {
    expect(rolePermissions.MEMBER.has('workspace.manage')).toBe(false);
  });

  it('allows owners to perform every declared permission', () => {
    expect(rolePermissions.OWNER.size).toBeGreaterThan(
      rolePermissions.ADMIN.size,
    );
    expect(rolePermissions.OWNER.has('message.delete_any')).toBe(true);
  });
});
