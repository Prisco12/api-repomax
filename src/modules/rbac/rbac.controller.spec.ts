import { PERMISSIONS_KEY } from '../authorization/decorators/permissions.decorator';
import { Permission } from '../authorization/permission-catalog';
import { RbacController } from './rbac.controller';
import { ANY_PERMISSIONS_KEY } from '../authorization/decorators/any-permissions.decorator';

describe('RbacController permissions', () => {
  it('separa atribuição de papéis da administração de papéis', () => {
    const assignPermissions = Reflect.getMetadata(
      PERMISSIONS_KEY,
      RbacController.prototype.setUserRoles,
    );
    const managePermissions = Reflect.getMetadata(
      PERMISSIONS_KEY,
      RbacController.prototype.createRole,
    );

    expect(assignPermissions).toEqual([Permission.ROLES_ASSIGN]);
    expect(managePermissions).toEqual([Permission.ROLES_MANAGE]);
  });

  it('permite listar papéis com manage ou assign', () => {
    const permissions = Reflect.getMetadata(
      ANY_PERMISSIONS_KEY,
      RbacController.prototype.listRoles,
    );

    expect(permissions).toEqual([
      Permission.ROLES_MANAGE,
      Permission.ROLES_ASSIGN,
    ]);
  });
});
