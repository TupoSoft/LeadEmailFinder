import { Injectable } from '@nestjs/common'
import { AutomapperProfile, InjectMapper } from '@automapper/nestjs'
import { createMap, forMember, mapFrom, Mapper, MappingConfiguration, MappingProfile } from '@automapper/core'
import { EmailVerification } from './email-verification.schema'
import { EmailVerificationResponseDto } from './email-verification-response.dto'
import { Types } from 'mongoose'

@Injectable()
export class EmailVerificationProfile extends AutomapperProfile {
    constructor(@InjectMapper() mapper: Mapper) {
        super(mapper)
    }

    get profile(): MappingProfile {
        return mapper => {
            createMap(mapper, EmailVerification, EmailVerificationResponseDto)
        }
    }

    protected get mappingConfigurations(): MappingConfiguration[] {
        return [
            forMember<EmailVerification & { _id: Types.ObjectId }, EmailVerificationResponseDto>(
                destination => destination.id,
                mapFrom(source => source._id.toHexString()),
            ),
        ]
    }
}
