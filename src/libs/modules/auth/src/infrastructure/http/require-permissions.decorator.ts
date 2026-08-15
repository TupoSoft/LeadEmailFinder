import { CustomDecorator, SetMetadata } from '@nestjs/common'
import { AuthPermission } from '@tuposoft/lead-email-finder/modules/identity'

export const REQUIRED_PERMISSIONS_METADATA_KEY = 'requiredPermissions'

export const RequirePermissions = (...permissions: AuthPermission[]): CustomDecorator<string> =>
    SetMetadata(REQUIRED_PERMISSIONS_METADATA_KEY, permissions)
