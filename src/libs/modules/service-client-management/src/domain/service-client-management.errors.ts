import { AuthPermission } from '@tuposoft/lead-email-finder/modules/identity'

export class ServiceClientAccessDeniedError extends Error {
    constructor(message: string) {
        super(message)
        this.name = ServiceClientAccessDeniedError.name
    }
}

export class ServiceClientPermissionCeilingExceededError extends Error {
    constructor(readonly excessPermissions: readonly AuthPermission[]) {
        super(`Cannot grant permissions beyond the actor's own: ${excessPermissions.join(', ')}`)
        this.name = ServiceClientPermissionCeilingExceededError.name
    }
}

export class DuplicateServiceClientPermissionsError extends Error {
    constructor() {
        super('Service client permissions must be unique')
        this.name = DuplicateServiceClientPermissionsError.name
    }
}

export class ServiceClientNotFoundError extends Error {
    constructor() {
        super('Service client not found')
        this.name = ServiceClientNotFoundError.name
    }
}

export class DisabledServiceClientRotationError extends Error {
    constructor() {
        super('Cannot rotate a disabled service client')
        this.name = DisabledServiceClientRotationError.name
    }
}

export class EmptyServiceClientPermissionsError extends Error {
    constructor() {
        super('Service client permissions must not be empty')
        this.name = EmptyServiceClientPermissionsError.name
    }
}
