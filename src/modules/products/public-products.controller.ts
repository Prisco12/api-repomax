import { Controller, Get, Param, Query } from '@nestjs/common';
import {
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { Public } from '../../common/decorators/public.decorator';
import { ListProductsDto } from './dto/list-products.dto';
import { ProductsService } from './products.service';

@Public()
@ApiTags('Public Products')
@Controller('products')
export class PublicProductsController {
  constructor(private readonly products: ProductsService) {}

  @ApiOperation({ summary: 'Listar produtos publicados' })
  @ApiOkResponse({ description: 'Lista pública paginada de produtos.' })
  @Get()
  list(@Query() query: ListProductsDto) {
    return this.products.listPublic(query);
  }

  @ApiOperation({ summary: 'Consultar produto publicado pelo slug' })
  @ApiNotFoundResponse({ description: 'Produto publicado não encontrado.' })
  @Get(':slug')
  findBySlug(@Param('slug') slug: string) {
    return this.products.findPublicBySlug(slug);
  }
}
