import { Module } from '@nestjs/common'
import { TypeOrmModule } from '@nestjs/typeorm'
import { Credit } from './credit.entity'
import { CreditsService } from './credits.service'
import { CreditGuard } from './credits.guard'
import { CreditsController } from './credits.controller'
import { PermissionsGuard, RolePermissionPolicy } from '@tuposoft/lead-email-finder/modules/auth'

@Module({
    imports: [TypeOrmModule.forFeature([Credit])],
    providers: [CreditsService, CreditGuard, RolePermissionPolicy, PermissionsGuard],
    controllers: [CreditsController],
    exports: [CreditGuard, CreditsService],
})
export class CreditsModule {}
