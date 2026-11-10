export interface SmtpResponse {
    code: number
    enhancedCode: string
    message: string
    lines: string[]
    capabilities: string[]
}
