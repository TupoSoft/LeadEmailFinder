import { CanActivate, ExecutionContext, Inject, Injectable, OnModuleInit, UnauthorizedException } from '@nestjs/common'
import { Reflector } from '@nestjs/core'
import { KeyPermissions } from '../key.enum'
import { Request } from 'express'
import { ClientGrpc } from '@nestjs/microservices'
import { firstValueFrom } from 'rxjs'
import { API_KEY_SERVICE_NAME, ApiKeyServiceClient } from '@tuposoft/lead-email-finder/proto/api_key/v1/api_key'

@Injectable()
export class ApiKeyGuard implements CanActivate, OnModuleInit {
    private apiKeyService: ApiKeyServiceClient

    constructor(
        @Inject('API_KEY_PACKAGE') private readonly client: ClientGrpc,
        private readonly reflector: Reflector,
    ) {}

    onModuleInit(): void {
        this.apiKeyService = this.client.getService<ApiKeyServiceClient>(API_KEY_SERVICE_NAME)
    }

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

        const { allowed } = await firstValueFrom(this.apiKeyService.checkKeyPermissions({ token, requiredPermissions }))

        return allowed
    }
}
