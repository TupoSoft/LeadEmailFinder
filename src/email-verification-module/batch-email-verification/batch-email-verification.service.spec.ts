import { Test, TestingModule } from '@nestjs/testing'
import { BatchEmailVerificationService } from './batch-email-verification.service'

describe('BatchEmailVerificationService', () => {
    let service: BatchEmailVerificationService

    beforeEach(async () => {
        const module: TestingModule = await Test.createTestingModule({
            providers: [BatchEmailVerificationService],
        }).compile()

        service = module.get<BatchEmailVerificationService>(BatchEmailVerificationService)
    })

    it('should be defined', () => {
        expect(service).toBeDefined()
    })
})
