import { Module } from '@nestjs/common'
import { TypeOrmModule } from '@nestjs/typeorm'
import { Credit } from './credit.entity'
import { CreditsService } from './credits.service'
import { CreditGuard } from './credits.guard'
import { CreditsController } from './credits.controller'
import { ApiKeyModule } from '@tuposoft/lead-email-finder/modules/api-key'

@Module({
    imports: [TypeOrmModule.forFeature([Credit]), ApiKeyModule],
    providers: [CreditsService, CreditGuard],
    controllers: [CreditsController],
    exports: [CreditGuard, CreditsService],
})
export class CreditsModule {}
