import { Body, Controller, Get, Param, Put, Query } from '@nestjs/common';
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
import { ReviewUserDto } from './dto/review-user.dto';
import { ListApprovalUsersDto } from './dto/list-approval-users.dto';

@ApiTags('Users')
@ApiBearerAuth()
@Controller('users')
export class UsersController {
  constructor(private readonly users: UsersService) {}
  @ApiOperation({ summary: 'Consultar usuário autenticado' })
  @ApiOkResponse({ description: 'Perfil do usuário autenticado.' })
  @ApiUnauthorizedResponse({
    description: 'Access token ausente, inválido ou expirado.',
  })
  @Get('me')
  me(@CurrentUser() user: AuthenticatedUser) {
    return this.users.me(user.id);
  }

  @Permissions(Permission.USERS_READ)
  @ApiOperation({
    summary: 'Listar usuários',
    description: 'Exige a permissão `users:read`.',
  })
  @ApiQuery({ name: 'page', required: false, example: 1, type: Number })
  @ApiQuery({ name: 'limit', required: false, example: 20, type: Number })
  @ApiOkResponse({ description: 'Lista paginada de usuários.' })
  @ApiForbiddenResponse({ description: 'Usuário não possui users:read.' })
  @Get()
  list(
    @PaginationParams() pagination: PaginationParamsType,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.users.list(pagination.page, pagination.limit, actor.id);
  }

  @Permissions(Permission.USERS_APPROVE)
  @ApiOperation({
    summary: 'Listar cadastros por status',
    description: 'Exige `users:approve`. Sem status, lista todos.',
  })
  @ApiOkResponse({
    description: 'Lista paginada de contas por status de aprovação.',
  })
  @Get('approvals')
  listApprovals(@Query() query: ListApprovalUsersDto) {
    return this.users.listByApprovalStatus(
      query.page,
      query.limit,
      query.status,
    );
  }

  @Permissions(Permission.USERS_APPROVE)
  @ApiOperation({
    summary: 'Aprovar ou rejeitar um cadastro',
    description: 'Exige `users:approve`.',
  })
  @ApiOkResponse({
    description:
      'Status do cadastro atualizado e sessões anteriores invalidadas.',
  })
  @Put(':id/approval')
  reviewAccount(
    @Param('id') id: string,
    @Body() dto: ReviewUserDto,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.users.reviewAccount(id, dto.status, actor.id);
  }
}
