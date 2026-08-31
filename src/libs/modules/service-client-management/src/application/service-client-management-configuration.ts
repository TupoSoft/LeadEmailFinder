export const SERVICE_CLIENT_MANAGEMENT_CONFIGURATION = Symbol('SERVICE_CLIENT_MANAGEMENT_CONFIGURATION')

export interface ServiceClientManagementConfiguration {
    readonly issuer: string
}
