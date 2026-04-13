import { Controller, Get, SerializeOptions } from '@nestjs/common'
import { HealthCheck, HealthCheckResult, HealthCheckService, TypeOrmHealthIndicator } from '@nestjs/terminus'
import { ApiExcludeController } from '@nestjs/swagger'
import { Public } from '@tuposoft/lead-email-finder/modules/api-key/application/decorators'

@Public()
@ApiExcludeController()
@Controller('health')
export class HealthController {
    constructor(
        private readonly healthCheckService: HealthCheckService,
        private readonly typeOrmHealthIndicator: TypeOrmHealthIndicator,
    ) {}

    @Get()
    @HealthCheck()
    @SerializeOptions({ strategy: 'exposeAll' })
    async check(): Promise<HealthCheckResult> {
        return this.healthCheckService.check([() => this.typeOrmHealthIndicator.pingCheck('postgres')])
    }
}
