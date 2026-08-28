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
import { CreateProductDto } from './dto/create-product.dto';
import { ListAdminProductsDto } from './dto/list-admin-products.dto';
import { SetProductStatusDto } from './dto/set-product-status.dto';
import { UpdateProductDto } from './dto/update-product.dto';
import { ProductsService } from './products.service';

@ApiTags('Admin Products')
@ApiBearerAuth()
@Controller('admin/products')
export class AdminProductsController {
  constructor(private readonly products: ProductsService) {}

  @Permissions(Permission.PRODUCTS_READ)
  @ApiOperation({ summary: 'Listar produtos no administrativo' })
  @Get()
  list(@Query() query: ListAdminProductsDto) {
    return this.products.listAdmin(query);
  }

  @Permissions(Permission.PRODUCTS_READ)
  @ApiOperation({ summary: 'Consultar produto pelo UUID' })
  @Get(':id')
  findById(@Param('id', ParseUUIDPipe) id: string) {
    return this.products.findAdminById(id);
  }

  @Permissions(Permission.PRODUCTS_CREATE)
  @ApiOperation({ summary: 'Criar produto em rascunho' })
  @ApiCreatedResponse({ description: 'Produto criado como DRAFT.' })
  @ApiConflictResponse({ description: 'Slug ou SKU já utilizado.' })
  @Post()
  create(
    @Body() dto: CreateProductDto,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.products.create(dto, actor.id);
  }

  @Permissions(Permission.PRODUCTS_UPDATE)
  @ApiOperation({ summary: 'Atualizar produto e categorias' })
  @Put(':id')
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateProductDto,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.products.update(id, dto, actor.id);
  }

  @Permissions(Permission.PRODUCTS_PUBLISH)
  @ApiOperation({ summary: 'Alterar status editorial do produto' })
  @ApiOkResponse({ description: 'Status atualizado.' })
  @Patch(':id/status')
  setStatus(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: SetProductStatusDto,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.products.setStatus(id, dto.status, actor.id);
  }

  @Permissions(Permission.PRODUCTS_DELETE)
  @ApiOperation({
    summary: 'Arquivar produto',
    description: 'Não exclui fisicamente; altera o status para ARCHIVED.',
  })
  @Delete(':id')
  archive(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.products.archive(id, actor.id);
  }
}
