import { Injectable } from '@nestjs/common'
import { parseTimeString } from '../util/time'
import { IEmailService, IEmailVerifier } from '../common'
import { Model } from 'mongoose'
import { EmailVerification } from './email-verification.schema'

@Injectable()
export class EmailVerificationService {
    private static readonly VERIFICATION_SHELF_LIFE = parseTimeString('1d')
    private static readonly INITIAL_COUNT = 0
    private static readonly COUNT_INCREMENT = 1

    constructor(
        private readonly emailVerifier: IEmailVerifier,
        private readonly emailVerificationModel: Model<EmailVerification>,
        private readonly emailService: IEmailService,
    ) {}
}
