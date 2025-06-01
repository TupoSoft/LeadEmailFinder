import { Test, TestingModule } from '@nestjs/testing'
import { BatchEmailVerificationServiceImpl } from './batch-email-verification-service-impl.service'

describe('BatchEmailVerificationService', () => {
    let service: BatchEmailVerificationServiceImpl

    beforeEach(async () => {
        const module: TestingModule = await Test.createTestingModule({
            providers: [BatchEmailVerificationServiceImpl],
        }).compile()

        service = module.get<BatchEmailVerificationServiceImpl>(BatchEmailVerificationServiceImpl)
    })

    it('should be defined', () => {
        expect(service).toBeDefined()
    })
})
