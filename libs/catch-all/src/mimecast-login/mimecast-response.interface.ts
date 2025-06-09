export interface MimecastResponse {
    data: Array<{
        emailAddress: string
        emailToken: string
        authenticate: ('Basic-Cloud' | 'Basic-Ad' | 'SAML' | 'JWT')[]
    }>
}
