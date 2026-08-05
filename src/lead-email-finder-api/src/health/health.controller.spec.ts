import { Test, TestingModule } from '@nestjs/testing'
import { HealthController } from './health.controller'
import { HealthCheckResult, HealthCheckService, TypeOrmHealthIndicator } from '@nestjs/terminus'
import { NestApplication } from '@nestjs/core'
import request from 'supertest'
import { HttpStatus } from '@nestjs/common'

describe('HealthController', () => {
    let app: NestApplication
    let controller: HealthController
    let healthCheckService: jest.Mocked<HealthCheckService>

    beforeAll(async () => {
        const module: TestingModule = await Test.createTestingModule({
            controllers: [HealthController],
            providers: [
                {
                    provide: HealthCheckService,
                    useValue: {
                        check: jest.fn(),
                    },
                },
                {
                    provide: TypeOrmHealthIndicator,
                    useValue: {
                        pingCheck: jest.fn(),
                    },
                },
            ],
        }).compile()

        app = module.createNestApplication()
        controller = module.get(HealthController)
        healthCheckService = module.get(HealthCheckService)

        await app.init()
    })

    afterAll(async () => {
        await app.close()
    })

    afterEach(() => jest.resetAllMocks())

    it('should be defined', () => {
        expect(controller).toBeDefined()
    })

    describe('check', () => {
        it('should return the result of health check service', async () => {
            const expectedResult: HealthCheckResult = {
                status: 'ok',
                info: { postgres: { status: 'up' } },
                details: { postgres: { status: 'up' } },
            }

            healthCheckService.check.mockResolvedValueOnce(expectedResult)

            await request(app.getHttpServer()).get('/health').expect(HttpStatus.OK, expectedResult)

            expect(healthCheckService.check).toHaveBeenCalled()
        })
    })
})
