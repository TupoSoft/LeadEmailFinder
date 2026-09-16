import type { VerificationOperation, VerificationResult, VerificationStatus } from './verification-api'

export const verificationCopy = {
    title: 'Verify an email',
    description: 'Check one address and follow its verification on a page you can bookmark.',
    email: 'Email address',
    submit: 'Verify email',
    cost: 'A new conclusive result costs one credit. Cached and inconclusive results are free.',
    invalid: 'Enter a valid email address, such as person@lef.test.',
    clockRejectedTitle: 'Check your device clock',
    clockRejected:
        "The request time is too far ahead of the server's time. Check and correct your device's date and time, then select Verify email again.",
    pending: 'Submitting your verification. Please wait before starting another request.',
    insufficient: 'There are not enough credits to run this verification.',
    owner: 'Contact an organization owner to arrange more credits.',
    billing: 'Go to billing',
    uncertainTitle: 'Submission could not be confirmed',
    uncertain:
        'The request may already have started. Recover it using the same address and request key to retrieve the original outcome and charge.',
    recover: 'Recover submission',
    retry: 'Retry verification',
    rateLimited: 'Verification temporarily limited',
    retryAfter: 'Retry after',
    retryMissing: 'The server did not provide a retry time. Wait before trying again.',
    retryHelp: 'Retrying is always your choice. This page will not submit automatically.',
    expiredTitle: 'Recovery has expired',
    expired:
        'The server can no longer recover this request. Its previous charge is unknown. Starting a new verification may create a separate charge.',
    newRequest: 'Start a new verification',
    ready: 'Your verification was submitted. Open its job page to see the status.',
    view: 'View verification',
    another: 'Verify another email',
    loading: { title: 'Loading verification', description: 'Retrieving the latest status for this verification.' },
    notFound: {
        title: 'Verification not found',
        description:
            'This verification is not available to your organization. Check the link or start a new verification. Job links are not retained indefinitely.',
    },
    readError: {
        title: 'Verification status unavailable',
        description:
            'We could not refresh the status. Try reading it again; this will not submit another verification.',
    },
    stale: 'The latest read failed. The status below is the last confirmed update and may be out of date.',
    offline:
        'You are offline. Reconnect to refresh the verification status. Any displayed result is the last confirmed update.',
    formOffline: 'You are offline. Reconnect before submitting a verification.',
    paused: 'Automatic status checks are paused while this page is hidden.',
    polling: 'Status is checked every five seconds while this page is visible and online.',
    stopped: 'Automatic status checks have paused after five minutes of checks. Refresh the status when you are ready.',
    refresh: 'Refresh status',
    refreshing: 'Refreshing status…',
    result: 'Verification result',
    resultSource: 'Result source',
    evidenceObserved: 'Evidence observed (UTC)',
    cacheExpires: 'Cache expires (UTC)',
    notReported: 'Not reported',
    catchAllUnconfirmed:
        'Catch-all: the server accepted a made-up address, so we couldn’t confirm whether this specific mailbox exists.',
    limits: 'These signals describe the checks performed. They do not guarantee delivery or establish permission to send.',
    yes: 'Yes',
    no: 'No',
    unknown: 'Unknown',
    noSources: 'No sources reported',
    states: {
        queued: {
            title: 'Verification queued',
            description: 'Your verification is waiting to run. You can bookmark this page and return to the same job.',
        },
        running: {
            title: 'Verification running',
            description: 'Your verification is in progress. The result will appear here when it is available.',
        },
        completed: {
            title: 'Verification completed',
            description: 'The verification finished. Review the individual signals and their limits below.',
        },
        failed: {
            title: 'Verification failed',
            description:
                'The verification could not finish. Review the confirmed charge below before starting a new verification.',
        },
        unavailable: {
            title: 'Verification unavailable',
            description:
                'A trustworthy outcome could not be determined. Refresh the status to check again. This does not confirm success, failure, or a credit adjustment.',
        },
    } satisfies Record<VerificationStatus['state'], { title: string; description: string }>,
}

export const verificationReasonLabels = {
    accepted_email: 'The mail server accepted the address during the check. Delivery is not guaranteed.',
    rejected_email: 'The mail server rejected the address during the check.',
    timeout: 'The check timed out before a reliable answer was available.',
    temporarily_blocked: 'The check was temporarily blocked.',
    no_mx_records: 'No mail exchange records were found for the domain.',
    unexpected_error: 'An unexpected problem prevented a reliable answer.',
    blacklisted: 'The check was blocked by a mail-server policy.',
    no_connect: 'A connection to the mail server could not be established.',
    exceeded_storage: 'The mail server reported a storage limit.',
    sender_blocked: 'The mail server blocked the checking sender.',
    secure_transport_unavailable: 'A verified secure connection to the mail server was unavailable.',
    webmail: 'The address uses a webmail service; this signal does not confirm mailbox existence.',
    unknown: 'The checks did not establish a reliable reason.',
} satisfies Record<VerificationResult['reason'], string>

export const verificationSourceLabels = {
    mx: 'Mail exchange check',
    microsoft_1: 'Microsoft account check 1',
    microsoft_2: 'Microsoft account check 2',
    microsoft_4: 'Microsoft account check 4',
    mimecast: 'Mimecast account check',
    linkedin: 'LinkedIn account check (legacy result)',
} satisfies Record<VerificationResult['sources'][number], string>

export function signalLabel(value: boolean | null): string {
    return value === true ? verificationCopy.yes : value === false ? verificationCopy.no : verificationCopy.unknown
}

export function verificationReasonLabel(result: Pick<VerificationResult, 'reason' | 'catchAll' | 'exists'>): string {
    if (result.reason === 'accepted_email' && result.catchAll === true && result.exists === null)
        return verificationCopy.catchAllUnconfirmed

    return Object.hasOwn(verificationReasonLabels, result.reason)
        ? verificationReasonLabels[result.reason]
        : verificationCopy.unknown
}

export const verificationOperationSources = {
    fresh: 'New verification',
    cache: 'Cached result',
    shared: 'Shared verification',
} satisfies Record<VerificationOperation['source'], string>

export const verificationChargeReasons = {
    conclusive: 'A new conclusive result used one credit.',
    cached: 'Existing evidence was reused at no charge.',
    shared: 'This request shared an existing verification at no charge.',
    inconclusive: 'The checks did not reach a conclusive result, so no credits were charged.',
    failed: 'The verification failed, so no credits were charged.',
} satisfies Record<NonNullable<VerificationOperation['billing']['reason']>, string>
