import { Controller, Get, ServiceUnavailableException } from '@nestjs/common';
import {
  ApiOkResponse,
  ApiOperation,
  ApiServiceUnavailableResponse,
  ApiTags,
} from '@nestjs/swagger';
import { Public } from '../../common/decorators/public.decorator';
import { PrismaService } from '../../infrastructure/database/prisma.service';

@ApiTags('Health')
@Controller('health')
@Public()
export class HealthController {
  constructor(private readonly prisma: PrismaService) {}

  @ApiOperation({ summary: 'Liveness', description: 'Indica que o processo HTTP está ativo; não consulta o banco.' })
  @ApiOkResponse({ description: 'API ativa.' })
  @Get()
  liveness() {
    return { status: 'ok' };
  }

  @ApiOperation({ summary: 'Readiness', description: 'Indica que a API está apta a receber tráfego e conectada ao banco.' })
  @ApiOkResponse({ description: 'API e banco disponíveis.' })
  @ApiServiceUnavailableResponse({ description: 'Banco de dados indisponível.' })
  @Get('ready')
  async readiness() {
    try {
      await this.prisma.$queryRawUnsafe('SELECT 1');
      return { status: 'ok', database: 'up' };
    } catch {
      throw new ServiceUnavailableException('Database unavailable');
    }
  }
}
