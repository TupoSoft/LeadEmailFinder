import { Module } from '@nestjs/common'
import { TypeOrmModule } from '@nestjs/typeorm'
import { LoggerModule } from 'pino-nestjs'
import { Key } from './models/key.entity'
import { ApiKeyGuard } from './application/api-key.guard'
import { ApiKeyService } from './application/api-key.service'
import { AdminKeySeeder } from './application/admin-key-seeder.service'
import { ApiKeyController } from './infrastructure/http/api-key.controller'
// Deep imports (not the auth barrel) — see the comment in api-key.controller.ts.
import { PermissionsGuard } from '@tuposoft/lead-email-finder/modules/auth/infrastructure/http/permissions.guard'
import { RolePermissionPolicy } from '@tuposoft/lead-email-finder/modules/auth/application/role-permission-policy.service'

@Module({
    imports: [TypeOrmModule.forFeature([Key]), LoggerModule.forRoot()],
    providers: [ApiKeyGuard, ApiKeyService, AdminKeySeeder, RolePermissionPolicy, PermissionsGuard],
    controllers: [ApiKeyController],
    exports: [ApiKeyGuard, ApiKeyService],
})
export class ApiKeyModule {}
