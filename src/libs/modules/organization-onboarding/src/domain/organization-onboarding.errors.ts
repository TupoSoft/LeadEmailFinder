export class NotInOrganizationError extends Error {
    constructor() {
        super('Principal does not belong to this organization')
        this.name = NotInOrganizationError.name
    }
}

export class InsufficientPermissionError extends Error {
    constructor(message: string) {
        super(message)
        this.name = InsufficientPermissionError.name
    }
}

export class MembershipNotFoundError extends Error {
    constructor() {
        super('Membership not found')
        this.name = MembershipNotFoundError.name
    }
}

export class InvitationNotFoundError extends Error {
    constructor() {
        super('Invitation not found')
        this.name = InvitationNotFoundError.name
    }
}

export class InvitationExpiredError extends Error {
    constructor() {
        super('Invitation has expired')
        this.name = InvitationExpiredError.name
    }
}

export class ConflictingMembershipError extends Error {
    constructor() {
        super('This identity already holds an active organization membership')
        this.name = ConflictingMembershipError.name
    }
}

export class FinalOwnerConflictError extends Error {
    constructor(message: string) {
        super(message)
        this.name = FinalOwnerConflictError.name
    }
}
