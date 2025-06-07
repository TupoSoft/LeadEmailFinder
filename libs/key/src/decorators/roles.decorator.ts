import { SetMetadata } from '@nestjs/common'
import { KeyPermissions } from '../key.enum'

export const RequireApiPermissions = (...permissions: KeyPermissions[]) => SetMetadata('permissions', permissions)
