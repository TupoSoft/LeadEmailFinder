import { Controller, Get, SerializeOptions } from '@nestjs/common'
import { HealthCheck, HealthCheckResult, HealthCheckService, TypeOrmHealthIndicator } from '@nestjs/terminus'
import { ApiOkResponse, ApiOperation, ApiServiceUnavailableResponse } from '@nestjs/swagger'
import type { SchemaObject } from '@nestjs/swagger/dist/interfaces/open-api-spec.interface'
import { Public } from '@tuposoft/lead-email-finder/modules/auth'

const POSTGRES_HEALTH_SCHEMA: SchemaObject = {
    type: 'object',
    required: ['status'],
    properties: { status: { type: 'string', enum: ['up', 'down'] } },
    additionalProperties: true,
}

const HEALTH_RESULT_SCHEMA: SchemaObject = {
    type: 'object',
    required: ['status', 'details'],
    properties: {
        status: { type: 'string', enum: ['ok', 'error', 'shutting_down'] },
        info: { type: 'object', properties: { postgres: POSTGRES_HEALTH_SCHEMA } },
        error: { type: 'object', properties: { postgres: POSTGRES_HEALTH_SCHEMA } },
        details: {
            type: 'object',
            required: ['postgres'],
            properties: { postgres: POSTGRES_HEALTH_SCHEMA },
        },
    },
}

@Public()
@Controller('health')
export class HealthController {
    constructor(
        private readonly healthCheckService: HealthCheckService,
        private readonly typeOrmHealthIndicator: TypeOrmHealthIndicator,
    ) {}

    @Get()
    @ApiOperation({ operationId: 'getHealth', summary: 'Read API and PostgreSQL health', security: [] })
    @ApiOkResponse({ description: 'The API and its PostgreSQL dependency are healthy.', schema: HEALTH_RESULT_SCHEMA })
    @ApiServiceUnavailableResponse({
        description: 'PostgreSQL is unavailable or the API is shutting down.',
        schema: HEALTH_RESULT_SCHEMA,
    })
    @HealthCheck()
    @SerializeOptions({ strategy: 'exposeAll' })
    async check(): Promise<HealthCheckResult> {
        return this.healthCheckService.check([() => this.typeOrmHealthIndicator.pingCheck('postgres')])
    }
}
