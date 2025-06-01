import { Test, TestingModule } from '@nestjs/testing'
import { BatchEmailVerificationServiceImpl } from './batch-email-verification-service-impl.service'
import { getQueueToken } from '@nestjs/bullmq'

describe('BatchEmailVerificationService', () => {
    let service: BatchEmailVerificationServiceImpl

    beforeEach(async () => {
        const module: TestingModule = await Test.createTestingModule({
            providers: [
                BatchEmailVerificationServiceImpl,
                {
                    provide: getQueueToken('batch-email-verification'),
                    useValue: null,
                },
                {
                    provide: getQueueToken('async-email-verification'),
                    useValue: null,
                },
            ],
        }).compile()

        service = module.get(BatchEmailVerificationServiceImpl)
    })

    it('should be defined', () => {
        expect(service).toBeDefined()
    })
})
