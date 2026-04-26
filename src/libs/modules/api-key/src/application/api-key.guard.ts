import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common'
import { Reflector } from '@nestjs/core'
import { Request } from 'express'
import { KeyPermissions } from '../domain/key.enum'
import { ApiKeyService } from './api-key.service'

@Injectable()
export class ApiKeyGuard implements CanActivate {
    constructor(
        private readonly reflector: Reflector,
        private readonly apiKeyService: ApiKeyService,
    ) {}

    async canActivate(context: ExecutionContext): Promise<boolean> {
        const isPublic = this.reflector.getAllAndOverride<boolean>('isPublic', [
            context.getHandler(),
            context.getClass(),
        ])

        if (isPublic) {
            return true
        }

        const requiredPermissions =
            this.reflector.getAllAndOverride<KeyPermissions[]>('permissions', [
                context.getHandler(),
                context.getClass(),
            ]) ?? []

        const request = context.switchToHttp().getRequest<Request>()

        const authHeader = request.headers['authorization']
        const bearerToken = authHeader?.startsWith('Bearer ') ? authHeader.substring(7) : undefined
        const xApiKey = request.headers['x-api-key'] as string | undefined
        const token = bearerToken ?? xApiKey

        if (!token) {
            throw new UnauthorizedException('API key is missing')
        }

        return await this.apiKeyService.validateKeyForRoles(token, requiredPermissions)
    }
}
