import { Controller, Get } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiForbiddenResponse,
  ApiOkResponse,
  ApiOperation,
  ApiQuery,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Permissions } from '../authorization/decorators/permissions.decorator';
import { AuthenticatedUser } from '../auth/domain/authenticated-user.interface';
import { UsersService } from './users.service';
import { Permission } from '../authorization/permission-catalog';
import {
  PaginationParams,
  PaginationParams as PaginationParamsType,
} from '../../common/decorators/pagination-params.decorator';

@ApiTags('Users')
@ApiBearerAuth()
@Controller('users')
export class UsersController {
  constructor(private readonly users: UsersService) {}
  @ApiOperation({ summary: 'Consultar usuário autenticado' })
  @ApiOkResponse({ description: 'Perfil do usuário autenticado.' })
  @ApiUnauthorizedResponse({ description: 'Access token ausente, inválido ou expirado.' })
  @Get('me')
  me(@CurrentUser() user: AuthenticatedUser) {
    return this.users.me(user.id);
  }
  @Permissions(Permission.USERS_READ)
  @ApiOperation({ summary: 'Listar usuários', description: 'Exige a permissão `users:read`.' })
  @ApiQuery({ name: 'page', required: false, example: 1, type: Number })
  @ApiQuery({ name: 'limit', required: false, example: 20, type: Number })
  @ApiOkResponse({ description: 'Lista paginada de usuários.' })
  @ApiForbiddenResponse({ description: 'Usuário não possui users:read.' })
  @Get()
  list(@PaginationParams() pagination: PaginationParamsType) {
    return this.users.list(pagination.page, pagination.limit);
  }
}
