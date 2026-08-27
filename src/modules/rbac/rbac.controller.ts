import { Body, Controller, Get, Param, Post, Put } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiBody,
  ApiCreatedResponse,
  ApiForbiddenResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiTags,
} from '@nestjs/swagger';
import { Permission } from '../authorization/permission-catalog';
import { Permissions } from '../authorization/decorators/permissions.decorator';
import { CreateRoleDto } from './dto/create-role.dto';
import { SetPermissionsDto } from './dto/set-permissions.dto';
import { SetUserRolesDto } from './dto/set-user-roles.dto';
import { RbacService } from './rbac.service';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { AuthenticatedUser } from '../auth/domain/authenticated-user.interface';
import { AnyPermissions } from '../authorization/decorators/any-permissions.decorator';

@ApiTags('RBAC')
@ApiBearerAuth()
@Controller('rbac')
export class RbacController {
  constructor(private readonly rbac: RbacService) {}
  @ApiOperation({
    summary: 'Listar permissões disponíveis',
    description: 'Exige `roles:manage`.',
  })
  @ApiOkResponse({ description: 'Catálogo de permissões válidas do template.' })
  @ApiForbiddenResponse({ description: 'Usuário não possui roles:manage.' })
  @Permissions(Permission.ROLES_MANAGE)
  @Get('permissions')
  listPermissions() {
    return this.rbac.listPermissions();
  }

  @ApiOperation({
    summary: 'Listar roles',
    description:
      'Exige `roles:manage` ou `roles:assign`. As permissões de cada papel são retornadas somente para quem possui `roles:manage`.',
  })
  @ApiOkResponse({ description: 'Papéis visíveis ao usuário autenticado.' })
  @AnyPermissions(Permission.ROLES_MANAGE, Permission.ROLES_ASSIGN)
  @Get('roles')
  listRoles(@CurrentUser() user: AuthenticatedUser) {
    return this.rbac.listRoles(
      user.id,
      user.permissions.includes(Permission.ROLES_MANAGE),
    );
  }

  @ApiOperation({ summary: 'Criar role', description: 'Exige `roles:manage`.' })
  @ApiBody({ type: CreateRoleDto })
  @ApiCreatedResponse({ description: 'Role criada.' })
  @Permissions(Permission.ROLES_MANAGE)
  @Post('roles')
  createRole(
    @Body() dto: CreateRoleDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.rbac.createRole(dto.name, dto.description, user.id);
  }

  @ApiOperation({
    summary: 'Definir permissões de uma role',
    description: 'Substitui as permissões. Exige `roles:manage`.',
  })
  @ApiParam({ name: 'name', example: 'manager' })
  @ApiBody({ type: SetPermissionsDto })
  @ApiOkResponse({
    description:
      'Role atualizada; tokens de usuários vinculados são invalidados.',
  })
  @Permissions(Permission.ROLES_MANAGE)
  @Put('roles/:name/permissions')
  setRolePermissions(
    @Param('name') name: string,
    @Body() dto: SetPermissionsDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.rbac.setRolePermissions(name, dto.permissions, user.id);
  }

  @Permissions(Permission.ROLES_ASSIGN)
  @ApiOperation({
    summary: 'Definir roles de um usuário',
    description: 'Substitui as roles do usuário. Exige `roles:assign`.',
  })
  @ApiParam({ name: 'userId', example: '00000000-0000-0000-0000-000000000000' })
  @ApiBody({ type: SetUserRolesDto })
  @ApiOkResponse({
    description:
      'Roles atualizadas; tokens anteriores do usuário são invalidados.',
  })
  @Put('users/:userId/roles')
  setUserRoles(
    @Param('userId') userId: string,
    @Body() dto: SetUserRolesDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.rbac.setUserRoles(userId, dto.roles, user.id);
  }
}
