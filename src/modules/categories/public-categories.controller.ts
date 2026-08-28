import { Controller, Get, Param } from '@nestjs/common';
import {
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { Public } from '../../common/decorators/public.decorator';
import { CategoriesService } from './categories.service';

@Public()
@ApiTags('Public Categories')
@Controller('categories')
export class PublicCategoriesController {
  constructor(private readonly categories: CategoriesService) {}

  @ApiOperation({ summary: 'Listar árvore pública de categorias ativas' })
  @ApiOkResponse({ description: 'Categorias ativas em formato hierárquico.' })
  @Get()
  list() {
    return this.categories.listPublic();
  }

  @ApiOperation({ summary: 'Consultar categoria pública pelo slug' })
  @ApiNotFoundResponse({ description: 'Categoria ativa não encontrada.' })
  @Get(':slug')
  findBySlug(@Param('slug') slug: string) {
    return this.categories.findPublicBySlug(slug);
  }
}
