import { Module } from '@nestjs/common'
import { MongooseModule } from '@nestjs/mongoose'
import { Domain, DomainSchema } from './domain.schema'
import { DomainProfile } from './domain.profile'
import { DomainService } from './domain.service'
import { HTMLDomainSynonymFinder } from './domain-synonym-finder'
import { HttpModule } from '@nestjs/axios'

@Module({
    imports: [MongooseModule.forFeature([{ name: Domain.name, schema: DomainSchema }]), HttpModule],
    providers: [DomainProfile, DomainService, HTMLDomainSynonymFinder],
    exports: [DomainService],
})
export class DomainModule {}
