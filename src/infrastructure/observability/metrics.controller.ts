import { Controller, Get, NotFoundException, Res } from '@nestjs/common';
import { ApiExcludeController } from '@nestjs/swagger';
import { SkipThrottle } from '@nestjs/throttler';
import { Response } from 'express';
import { Public } from '../../common/decorators/public.decorator';
import { MetricsService } from './metrics.service';

@Public()
@SkipThrottle()
@ApiExcludeController()
@Controller('metrics')
export class MetricsController {
  constructor(private readonly metrics: MetricsService) {}

  @Get()
  async getMetrics(@Res() response: Response) {
    if (!this.metrics.enabled) throw new NotFoundException();
    response.type(this.metrics.contentType()).send(await this.metrics.render());
  }
}
