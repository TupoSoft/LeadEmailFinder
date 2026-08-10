import { CanActivate, ExecutionContext, HttpException, HttpStatus, Injectable } from '@nestjs/common'
import { Request } from 'express'
import { CreditsService } from './credits.service'
import { InsufficientCreditsException } from './credits.error'

@Injectable()
export class CreditGuard implements CanActivate {
    constructor(private readonly creditsService: CreditsService) {}

    async canActivate(context: ExecutionContext): Promise<boolean> {
        const request = context.switchToHttp().getRequest<Request>()

        const authHeader = request.headers['authorization']
        const bearerToken = authHeader?.startsWith('Bearer ') ? authHeader.substring(7) : undefined
        const xApiKey = request.headers['x-api-key'] as string | undefined
        const token = bearerToken ?? xApiKey

        if (!token) {
            throw new HttpException('API key is missing', HttpStatus.UNAUTHORIZED)
        }

        try {
            await this.creditsService.deductCredit(token)
        } catch (error) {
            if (error instanceof InsufficientCreditsException) {
                throw new HttpException('Insufficient credits', HttpStatus.PAYMENT_REQUIRED)
            }
            throw error
        }

        return true
    }
}
