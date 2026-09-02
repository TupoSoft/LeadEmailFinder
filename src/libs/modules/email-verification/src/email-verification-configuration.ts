export interface BatchUploadConfiguration {
    S3_BUCKET: string
}

export interface CatchAllProxyConfiguration {
    CATCH_ALL_HTTP_PROXY_URL?: string
    CATCH_ALL_PROVIDER?: string
    CATCH_ALL_PROVIDER_APPROVAL_ID?: string
    CATCH_ALL_PROVIDER_REGION?: string
}

export interface SmtpConfiguration {
    SMTP_PORT?: number
}
