import { Injectable, UnauthorizedException } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository } from 'typeorm'
import { ServiceCredential } from '@tuposoft/lead-email-finder/modules/identity'

@Injectable()
export class ServiceCredentialResolver {
    constructor(
        @InjectRepository(ServiceCredential) private readonly serviceCredentialRepo: Repository<ServiceCredential>,
    ) {}

    async resolveActive(issuer: string, subject: string): Promise<ServiceCredential> {
        const credential = await this.serviceCredentialRepo.findOne({ where: { issuer, subject } })

        if (!credential || credential.status !== 'active') {
            throw new UnauthorizedException('Service credential is unknown, disabled, or deleted')
        }

        return credential
    }
}
