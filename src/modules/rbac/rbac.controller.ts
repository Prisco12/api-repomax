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

@ApiTags('RBAC')
@ApiBearerAuth()
@Permissions(Permission.ROLES_MANAGE)
@Controller('rbac')
export class RbacController {
  constructor(private readonly rbac: RbacService) {}
  @ApiOperation({ summary: 'Listar permissões disponíveis', description: 'Exige `roles:manage`.' })
  @ApiOkResponse({ description: 'Catálogo de permissões válidas do template.' })
  @ApiForbiddenResponse({ description: 'Usuário não possui roles:manage.' })
  @Get('permissions') listPermissions() {
    return this.rbac.listPermissions();
  }
  @ApiOperation({ summary: 'Listar roles', description: 'Exige `roles:manage`.' })
  @ApiOkResponse({ description: 'Roles persistidas e suas permissões.' })
  @Get('roles') listRoles() {
    return this.rbac.listRoles();
  }
  @ApiOperation({ summary: 'Criar role', description: 'Exige `roles:manage`.' })
  @ApiBody({ type: CreateRoleDto })
  @ApiCreatedResponse({ description: 'Role criada.' })
  @Post('roles') createRole(
    @Body() dto: CreateRoleDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.rbac.createRole(dto.name, dto.description, user.id);
  }
  @ApiOperation({ summary: 'Definir permissões de uma role', description: 'Substitui as permissões. Exige `roles:manage`.' })
  @ApiParam({ name: 'name', example: 'manager' })
  @ApiBody({ type: SetPermissionsDto })
  @ApiOkResponse({ description: 'Role atualizada; tokens de usuários vinculados são invalidados.' })
  @Put('roles/:name/permissions') setRolePermissions(
    @Param('name') name: string,
    @Body() dto: SetPermissionsDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.rbac.setRolePermissions(name, dto.permissions, user.id);
  }
  @ApiOperation({ summary: 'Definir roles de um usuário', description: 'Substitui as roles do usuário. Exige `roles:manage`.' })
  @ApiParam({ name: 'userId', example: '00000000-0000-0000-0000-000000000000' })
  @ApiBody({ type: SetUserRolesDto })
  @ApiOkResponse({ description: 'Roles atualizadas; tokens anteriores do usuário são invalidados.' })
  @Put('users/:userId/roles') setUserRoles(
    @Param('userId') userId: string,
    @Body() dto: SetUserRolesDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.rbac.setUserRoles(userId, dto.roles, user.id);
  }
}
