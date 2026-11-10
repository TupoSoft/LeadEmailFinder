export interface BatchUploadConfiguration {
    S3_BUCKET: string
}

export interface SmtpConfiguration {
    SMTP_PORT?: number
    SMTP_TLS_CA_FILE?: string
}
