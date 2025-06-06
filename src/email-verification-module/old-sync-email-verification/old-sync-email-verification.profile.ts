import { Injectable } from '@nestjs/common'
import {
    Converter,
    convertUsing,
    createMap,
    forMember,
    mapFrom,
    Mapper,
    MappingConfiguration,
    MappingProfile,
} from '@automapper/core'
import { AutomapperProfile, InjectMapper } from '@automapper/nestjs'
import { EmailVerificationResponseDto } from '../sync-email-verification'
import { OldSyncEmailVerificationResponseDto } from './old-sync-email-verification-response.dto'
import { CatchAllStatus, DeliveryStatus } from './old-email-verification.enums'

const booleanToDeliveryStatusConverter: Converter<boolean | null, DeliveryStatus> = {
    convert(source: boolean | null): DeliveryStatus {
        switch (source) {
            case true:
                return DeliveryStatus.Accepted
            case false:
                return DeliveryStatus.Rejected
            case null:
                return DeliveryStatus.NotProcessed
        }
    },
}

const booleanToCatchAllConverter: Converter<boolean | null, CatchAllStatus> = {
    convert(source: boolean | null): CatchAllStatus {
        switch (source) {
            case true:
                return CatchAllStatus.Enabled
            case false:
                return CatchAllStatus.Disabled
            case null:
                return CatchAllStatus.Unknown
        }
    },
}

@Injectable()
export class OldSyncEmailVerificationProfile extends AutomapperProfile {
    get profile(): MappingProfile {
        return mapper => {
            createMap(mapper, EmailVerificationResponseDto, OldSyncEmailVerificationResponseDto)
        }
    }

    constructor(@InjectMapper() mapper: Mapper) {
        super(mapper)
    }

    protected get mappingConfigurations(): MappingConfiguration[] {
        return [
            forMember<EmailVerificationResponseDto, OldSyncEmailVerificationResponseDto>(
                destination => destination.deliveryStatus,
                convertUsing(booleanToDeliveryStatusConverter, source => source.exists),
            ),
            forMember<EmailVerificationResponseDto, OldSyncEmailVerificationResponseDto>(
                destination => destination.catchAll,
                convertUsing(booleanToCatchAllConverter, source => source.catchAll),
            ),
            forMember<EmailVerificationResponseDto, OldSyncEmailVerificationResponseDto>(
                destination => destination.verifiedAt,
                mapFrom(source => source.createdAt.toISOString()),
            ),
        ]
    }
}
