import { Module } from '@nestjs/common'
import { TypeOrmModule } from '@nestjs/typeorm'
import { Domain } from './domain.entity'
import { DomainProfile } from './domain.profile'
import { DomainService } from './domain.service'
import { HTMLDomainSynonymFinder } from './domain-synonym-finder'
import { HttpModule } from '@nestjs/axios'

@Module({
    imports: [TypeOrmModule.forFeature([Domain]), HttpModule],
    providers: [DomainProfile, DomainService, HTMLDomainSynonymFinder],
    exports: [DomainService],
})
export class DomainModule {}
