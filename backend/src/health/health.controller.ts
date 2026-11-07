import {
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  ServiceUnavailableException,
} from '@nestjs/common';
import { HealthService, HealthCheckResult } from './health.service';

@Controller('health')
export class HealthController {
  constructor(private readonly healthService: HealthService) {}

  @Get()
  @HttpCode(HttpStatus.OK)
  async getHealth(): Promise<HealthCheckResult> {
    const result = await this.healthService.checkHealth();
    if (result.status !== 'ok') {
      throw new ServiceUnavailableException(result);
    }
    return result;
  }

  @Get('ready')
  @HttpCode(HttpStatus.OK)
  async getReadiness(): Promise<HealthCheckResult> {
    const result = await this.healthService.checkHealth();
    if (result.status !== 'ok') {
      throw new ServiceUnavailableException(result);
    }
    return result;
  }

  @Get('live')
  @HttpCode(HttpStatus.OK)
  getLiveness(): HealthCheckResult {
    return this.healthService.checkLiveness();
  }
}
