import { Controller, Get, SerializeOptions } from '@nestjs/common'
import { HealthCheck, HealthCheckResult, HealthCheckService, MongooseHealthIndicator } from '@nestjs/terminus'

@Controller('health')
export class HealthController {
    constructor(
        private readonly healthCheckService: HealthCheckService,
        private readonly mongooseHealthIndicator: MongooseHealthIndicator,
    ) {}

    @Get()
    @HealthCheck()
    @SerializeOptions({ strategy: 'exposeAll' })
    async check(): Promise<HealthCheckResult> {
        return this.healthCheckService.check([() => this.mongooseHealthIndicator.pingCheck('mongodb')])
    }
}
