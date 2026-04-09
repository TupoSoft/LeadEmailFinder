import { CustomDecorator, SetMetadata } from '@nestjs/common'
import { KeyPermissions } from '@tuposoft/lead-email-finder/modules/api-key/domain/key.enum'

export const RequireApiPermissions = (...permissions: KeyPermissions[]): CustomDecorator<string> =>
    SetMetadata('permissions', permissions)
