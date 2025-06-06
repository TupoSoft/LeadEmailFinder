import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common'
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
        const isPublic = this.reflector.getAllAndOverride<boolean>('isPublic', [
            context.getHandler(),
            context.getClass(),
        ])

        if (isPublic) {
            return true
        }

        const requiredPermissions = this.reflector.getAllAndOverride<KeyPermissions[]>('permissions', [
            context.getHandler(),
            context.getClass(),
        ])

        const request = context.switchToHttp().getRequest<Request>()

        const authHeader = request.headers['authorization']
        const bearerToken = authHeader?.startsWith('Bearer ') ? authHeader.substring(7) : undefined
        const xApiKey = request.headers['x-api-key'] as string | undefined
        const apiKey = bearerToken ?? xApiKey

        if (!apiKey) {
            throw new UnauthorizedException('API key is missing')
        }

        return await this.keyService.validateKeyForRoles(apiKey, requiredPermissions)
    }
}
