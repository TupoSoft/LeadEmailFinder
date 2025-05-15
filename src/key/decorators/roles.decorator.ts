import { SetMetadata } from '@nestjs/common'
import { KeyRole } from '../key.schema'

export const RequireApiPermissions = (...roles: KeyRole[]) => SetMetadata('roles', roles)
