import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Put,
  Query,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { AuthenticatedUser } from '../auth/domain/authenticated-user.interface';
import { Permissions } from '../authorization/decorators/permissions.decorator';
import { Permission } from '../authorization/permission-catalog';
import { CategoriesService } from './categories.service';
import { CreateCategoryDto } from './dto/create-category.dto';
import { ListAdminCategoriesDto } from './dto/list-admin-categories.dto';
import { SetCategoryStatusDto } from './dto/set-category-status.dto';
import { UpdateCategoryDto } from './dto/update-category.dto';

@ApiTags('Admin Categories')
@ApiBearerAuth()
@Controller('admin/categories')
export class AdminCategoriesController {
  constructor(private readonly categories: CategoriesService) {}

  @Permissions(Permission.CATEGORIES_READ)
  @ApiOperation({ summary: 'Listar categorias no administrativo' })
  @Get()
  list(@Query() query: ListAdminCategoriesDto) {
    return this.categories.listAdmin(query);
  }

  @Permissions(Permission.CATEGORIES_READ)
  @ApiOperation({ summary: 'Consultar categoria pelo UUID' })
  @Get(':id')
  findById(@Param('id', ParseUUIDPipe) id: string) {
    return this.categories.findAdminById(id);
  }

  @Permissions(Permission.CATEGORIES_CREATE)
  @ApiOperation({ summary: 'Criar categoria' })
  @ApiCreatedResponse({ description: 'Categoria criada.' })
  @ApiConflictResponse({ description: 'Slug já utilizado.' })
  @Post()
  create(
    @Body() dto: CreateCategoryDto,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.categories.create(dto, actor.id);
  }

  @Permissions(Permission.CATEGORIES_UPDATE)
  @ApiOperation({ summary: 'Atualizar categoria' })
  @Put(':id')
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateCategoryDto,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.categories.update(id, dto, actor.id);
  }

  @Permissions(Permission.CATEGORIES_UPDATE)
  @ApiOperation({ summary: 'Ativar ou desativar categoria' })
  @ApiOkResponse({ description: 'Status atualizado.' })
  @Patch(':id/status')
  setStatus(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: SetCategoryStatusDto,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.categories.setStatus(id, dto.isActive, actor.id);
  }

  @Permissions(Permission.CATEGORIES_DELETE)
  @ApiOperation({
    summary: 'Excluir ou desativar categoria',
    description:
      'Exclui quando não está em uso; caso possua produtos ou filhas, desativa. Bloqueia se for a última categoria ativa de produto publicado.',
  })
  @ApiConflictResponse({
    description: 'A categoria é necessária para um produto publicado.',
  })
  @Delete(':id')
  remove(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.categories.remove(id, actor.id);
  }
}
