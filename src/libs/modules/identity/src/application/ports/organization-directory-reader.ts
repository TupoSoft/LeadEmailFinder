export const ORGANIZATION_DIRECTORY_READER = Symbol('ORGANIZATION_DIRECTORY_READER')

export interface OrganizationDirectorySeekKey {
    /** Millisecond epoch from the last returned record's createdAt. */
    readonly createdAtMilliseconds: number
    readonly id: string
}

export interface OrganizationDirectoryReadInput {
    /** The caller supplies an integer from 1 through 100. */
    readonly limit: number
    readonly before?: OrganizationDirectorySeekKey
}

export interface OrganizationDirectoryRecord {
    readonly id: string
    readonly name: string
    /** Database creation time truncated to the millisecond used for ordering and seeking. */
    readonly createdAt: Date
    readonly updatedAt: Date
}

export interface OrganizationDirectoryPage {
    readonly organizations: readonly OrganizationDirectoryRecord[]
    readonly hasMore: boolean
}

export interface OrganizationDirectoryReader {
    /** Returns the safe directory projection for one organization, or null when absent. */
    findById(organizationId: string): Promise<OrganizationDirectoryRecord | null>

    /** Returns at most limit records in descending millisecond creation time and UUID order. */
    list(input: OrganizationDirectoryReadInput): Promise<OrganizationDirectoryPage>
}
