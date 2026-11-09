import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { parse } from 'yaml'
import { z } from 'zod'

export const ACCOUNT_DISCOVERY_PROVIDERS = [
    'microsoft_get_credential_type',
    'microsoft_login',
    'mimecast',
    'office_apps',
] as const

export type AccountDiscoveryProvider = (typeof ACCOUNT_DISCOVERY_PROVIDERS)[number]

export const ACCOUNT_DISCOVERY_PURPOSE = 'email_verification.account_discovery' as const

export type AccountDiscoveryPurpose = typeof ACCOUNT_DISCOVERY_PURPOSE

export const ACCOUNT_DISCOVERY_APPROVAL_STATUSES = ['active', 'suspended', 'revoked', 'expired'] as const

export type AccountDiscoveryApprovalStatus = (typeof ACCOUNT_DISCOVERY_APPROVAL_STATUSES)[number]

export const ACCOUNT_DISCOVERY_APPROVALS_RELATIVE_PATH = 'config/privacy/account-discovery-approvals.yaml'
export const ACCOUNT_DISCOVERY_APPROVALS_PATH = resolve(
    __dirname,
    '../../../../../..',
    ACCOUNT_DISCOVERY_APPROVALS_RELATIVE_PATH,
)

const utcInstantSchema = z.iso.datetime({ offset: false })

const boundedStringSchema = z
    .string()
    .max(256)
    .refine(value => value.length === 0 || value.trim() === value, 'Must not have surrounding whitespace')

const nonBlankStringSchema = boundedStringSchema.refine(value => value.length > 0, 'Must not be empty')

const ACTIVE_EVIDENCE_FIELDS = [
    'processingContractVersion',
    'recipientRegisterId',
    'vendorReviewEvidenceId',
    'securityReviewEvidenceId',
    'transferReviewEvidenceId',
    'customerAuthorizationEvidenceId',
    'approvalOwner',
] as const

export const accountDiscoveryApprovalSchema = z
    .strictObject({
        id: nonBlankStringSchema,
        status: z.enum(ACCOUNT_DISCOVERY_APPROVAL_STATUSES),
        provider: z.enum(ACCOUNT_DISCOVERY_PROVIDERS),
        purpose: z.literal(ACCOUNT_DISCOVERY_PURPOSE),
        region: nonBlankStringSchema,
        effectiveAt: utcInstantSchema,
        expiresAt: utcInstantSchema,
        processingContractVersion: boundedStringSchema,
        recipientRegisterId: boundedStringSchema,
        vendorReviewEvidenceId: boundedStringSchema,
        securityReviewEvidenceId: boundedStringSchema,
        transferReviewEvidenceId: boundedStringSchema,
        customerAuthorizationEvidenceId: boundedStringSchema,
        approvalOwner: boundedStringSchema,
        reviewedAt: utcInstantSchema,
    })
    .superRefine((approval, context) => {
        if (Date.parse(approval.effectiveAt) >= Date.parse(approval.expiresAt)) {
            context.addIssue({
                code: 'custom',
                path: ['expiresAt'],
                message: 'Must be later than effectiveAt',
            })
        }

        if (approval.status !== 'active') {
            return
        }

        for (const field of ACTIVE_EVIDENCE_FIELDS) {
            if (approval[field].length === 0) {
                context.addIssue({
                    code: 'custom',
                    path: [field],
                    message: 'Active approvals require this evidence field',
                })
            }
        }
    })

export type AccountDiscoveryApproval = z.infer<typeof accountDiscoveryApprovalSchema>

export const accountDiscoveryApprovalManifestSchema = z
    .strictObject({
        schemaVersion: z.literal(1),
        revision: nonBlankStringSchema,
        approvals: z.array(accountDiscoveryApprovalSchema),
    })
    .superRefine((manifest, context) => {
        const ids = new Set<string>()

        manifest.approvals.forEach((approval, index) => {
            if (ids.has(approval.id)) {
                context.addIssue({
                    code: 'custom',
                    path: ['approvals', index, 'id'],
                    message: `Duplicate approval ID at index ${index}`,
                })
            }

            ids.add(approval.id)
        })

        if (manifest.revision === 'initial-empty' && manifest.approvals.length !== 0) {
            context.addIssue({
                code: 'custom',
                path: ['revision'],
                message: 'The initial-empty revision cannot contain approvals',
            })
        }
    })

export type AccountDiscoveryApprovalManifest = z.infer<typeof accountDiscoveryApprovalManifestSchema>

const SECRET_LOOKING_PATTERNS: readonly RegExp[] = [
    /-----BEGIN(?: [A-Z0-9]+)* PRIVATE KEY-----/i,
    /\b(?:password|passwd|api[_ -]?key|client[_ -]?secret|secret|token|authorization|cookie|session(?:id)?)\s*[:=]\s*["']?[^\s"']{8,}/i,
    /\b(?:Basic|Bearer)\s+[A-Za-z0-9._~+/=-]{12,}/i,
    /\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\b/,
    /\b(?:gh[opusr]_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,})\b/,
    /\bAKIA[0-9A-Z]{16}\b/,
    /\bAIza[0-9A-Za-z_-]{30,}\b/,
    /\bxox[baprs]-[0-9A-Za-z-]{10,}\b/,
    /\b(?:sk|rk)_(?:live|test)_[A-Za-z0-9]{12,}\b/,
    /\b(?:mongodb(?:\+srv)?|postgres(?:ql)?|redis):\/\/[^/\s:@]+:[^/\s@]+@/i,
]

export class AccountDiscoveryApprovalsValidationError extends Error {
    constructor(issues: readonly string[]) {
        super(`Invalid account-discovery approval manifest:\n${issues.map(issue => `- ${issue}`).join('\n')}`)
        this.name = AccountDiscoveryApprovalsValidationError.name
    }
}

function pathLabel(path: readonly PropertyKey[]): string {
    return path.length === 0 ? '<root>' : path.map(String).join('.')
}

function findSecretLookingPaths(value: unknown, path: PropertyKey[] = []): string[] {
    if (typeof value === 'string') {
        return SECRET_LOOKING_PATTERNS.some(pattern => pattern.test(value)) ? [pathLabel(path)] : []
    }

    if (Array.isArray(value)) {
        return value.flatMap((entry, index) => findSecretLookingPaths(entry, [...path, index]))
    }

    if (value !== null && typeof value === 'object') {
        return Object.entries(value).flatMap(([key, entry]) => findSecretLookingPaths(entry, [...path, key]))
    }

    return []
}

function parseYaml(source: string): unknown {
    try {
        return parse(source)
    } catch {
        throw new AccountDiscoveryApprovalsValidationError(['YAML syntax is invalid'])
    }
}

function zodIssueLabel(issue: z.core.$ZodIssue): string {
    if (issue.code === 'unrecognized_keys') {
        return `${pathLabel(issue.path)}: Unrecognized key`
    }

    return `${pathLabel(issue.path)}: ${issue.message}`
}

export function parseAccountDiscoveryApprovals(source: string): AccountDiscoveryApprovalManifest {
    if (SECRET_LOOKING_PATTERNS.some(pattern => pattern.test(source))) {
        throw new AccountDiscoveryApprovalsValidationError([
            '<document>: Secret-looking values are not allowed, including in comments',
        ])
    }

    const parsed = parseYaml(source)
    const secretPaths = findSecretLookingPaths(parsed)

    if (secretPaths.length > 0) {
        throw new AccountDiscoveryApprovalsValidationError(
            secretPaths.map(path => `${path}: Secret-looking values are not allowed`),
        )
    }

    const result = accountDiscoveryApprovalManifestSchema.safeParse(parsed)

    if (!result.success) {
        throw new AccountDiscoveryApprovalsValidationError(result.error.issues.map(zodIssueLabel))
    }

    return result.data
}

export async function loadAccountDiscoveryApprovals(): Promise<AccountDiscoveryApprovalManifest> {
    return parseAccountDiscoveryApprovals(await readFile(ACCOUNT_DISCOVERY_APPROVALS_PATH, 'utf8'))
}

export interface AccountDiscoveryApprovalsCheckOptions {
    now?: Date
    previousSource?: string | null
    requireRevisionBaseline?: boolean
}

function canonicalApprovalContent(manifest: AccountDiscoveryApprovalManifest): string {
    return JSON.stringify([...manifest.approvals].sort((left, right) => left.id.localeCompare(right.id)))
}

export function checkAccountDiscoveryApprovals(
    source: string,
    options: AccountDiscoveryApprovalsCheckOptions = {},
): AccountDiscoveryApprovalManifest {
    const manifest = parseAccountDiscoveryApprovals(source)
    const now = options.now ?? new Date()

    if (Number.isNaN(now.getTime())) {
        throw new Error('Account-discovery approval check requires a valid clock value')
    }

    const expiredActiveApproval = manifest.approvals.find(
        approval => approval.status === 'active' && Date.parse(approval.expiresAt) <= now.getTime(),
    )

    if (expiredActiveApproval) {
        throw new AccountDiscoveryApprovalsValidationError([
            `approvals.${manifest.approvals.indexOf(expiredActiveApproval)}.expiresAt: Active approval is expired`,
        ])
    }

    if (options.previousSource === undefined) {
        return manifest
    }

    if (options.previousSource === null) {
        if (
            options.requireRevisionBaseline === true &&
            (manifest.revision !== 'initial-empty' || manifest.approvals.length !== 0)
        ) {
            throw new AccountDiscoveryApprovalsValidationError([
                'revision: Cannot validate a nonempty manifest without the previous Git revision',
            ])
        }

        return manifest
    }

    const previousManifest = parseAccountDiscoveryApprovals(options.previousSource)
    const approvalContentChanged = canonicalApprovalContent(previousManifest) !== canonicalApprovalContent(manifest)

    if (approvalContentChanged && previousManifest.revision === manifest.revision) {
        throw new AccountDiscoveryApprovalsValidationError(['revision: Must change whenever approval content changes'])
    }

    return manifest
}
