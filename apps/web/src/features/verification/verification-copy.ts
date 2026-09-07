import type { VerificationResult, VerificationStatus } from './verification-api'

export const verificationCopy = {
    title: 'Verify an email',
    description: 'Check one address and follow its verification on a page you can bookmark.',
    email: 'Email address',
    submit: 'Verify email',
    cost: 'Submitting a verification may use one credit.',
    invalid: 'Enter a valid email address, such as person@lef.test.',
    pending: 'Submitting your verification. Please wait before starting another request.',
    insufficient: 'There are not enough credits to run this verification.',
    owner: 'Contact an organization owner to arrange more credits.',
    billing: 'Go to billing',
    uncertainTitle: 'Submission could not be confirmed',
    uncertain:
        'The request may already have started and used one credit. We could not retrieve its job link. A new request may use another credit.',
    acknowledge: 'I understand that a new request may use another credit.',
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
                'The verification could not finish. You can refresh its status or deliberately start a new verification. No credit adjustment is implied.',
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
