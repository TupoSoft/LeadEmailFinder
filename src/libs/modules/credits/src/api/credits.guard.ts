import { CanActivate, ExecutionContext, HttpException, HttpStatus, Injectable } from '@nestjs/common'
import { Request } from 'express'
import { randomUUID } from 'node:crypto'
import { getAuthPrincipal } from '@tuposoft/lead-email-finder/modules/auth'
import { CreditsService } from '../application/credits.service'
import { InsufficientCreditsException } from '../domain/credits.error'

@Injectable()
export class CreditGuard implements CanActivate {
    constructor(private readonly creditsService: CreditsService) {}

    async canActivate(context: ExecutionContext): Promise<boolean> {
        const request = context.switchToHttp().getRequest<Request>()
        const principal = getAuthPrincipal(request)

        if (!principal) {
            throw new HttpException('Authentication principal is missing', HttpStatus.UNAUTHORIZED)
        }

        try {
            await this.creditsService.debit(principal.organizationId, 1, randomUUID())
        } catch (error) {
            if (error instanceof InsufficientCreditsException) {
                throw new HttpException('Insufficient credits', HttpStatus.PAYMENT_REQUIRED)
            }
            throw error
        }

        return true
    }
}
