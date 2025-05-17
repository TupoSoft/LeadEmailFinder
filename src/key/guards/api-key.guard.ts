import { Injectable, CanActivate, ExecutionContext, UnauthorizedException } from '@nestjs/common'
import { Reflector } from '@nestjs/core'
import { KeyService } from '../key.service'
import { KeyPermissions } from '../key.enum'
import { Request } from 'express'

@Injectable()
export class ApiKeyGuard implements CanActivate {
    constructor(
        private readonly keyService: KeyService,
        private readonly reflector: Reflector,
    ) {}

    async canActivate(context: ExecutionContext): Promise<boolean> {
        const requiredPermissions = this.reflector.get<KeyPermissions[]>('permissions', context.getHandler()) || []

        const request = context.switchToHttp().getRequest<Request>()

        const apiKey = request.headers['x-api-key'] as string | undefined

        if (!apiKey) {
            throw new UnauthorizedException('API key is missing')
        }

        const isValid = await this.keyService.validateKeyForRoles(apiKey, requiredPermissions)

        return isValid
    }
}
