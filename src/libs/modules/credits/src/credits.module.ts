import { Module } from '@nestjs/common'
import { IdentityModule } from '@tuposoft/lead-email-finder/modules/identity'
import { CreditsService } from './credits.service'
import { CreditGuard } from './credits.guard'
import { CreditsController } from './credits.controller'
import { PermissionsGuard, RolePermissionPolicy } from '@tuposoft/lead-email-finder/modules/auth'

@Module({
    imports: [IdentityModule],
    providers: [CreditsService, CreditGuard, RolePermissionPolicy, PermissionsGuard],
    controllers: [CreditsController],
    exports: [CreditGuard, CreditsService],
})
export class CreditsModule {}
