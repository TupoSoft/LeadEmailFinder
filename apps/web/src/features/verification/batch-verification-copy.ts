export const batchVerificationCopy = {
    title: 'Verify a CSV file',
    description: 'Upload a list of email addresses and follow its verification on a page you can bookmark.',
    format: 'Choose one .csv file, up to 100 MB (104,857,600 bytes). Include a header row with an email column containing the addresses to verify.',
    cost: 'Credits are determined from valid rows after upload. Uploading does not confirm that validation or payment has finished.',
    choose: 'CSV file',
    submit: 'Upload and verify CSV',
    pending: 'Uploading CSV',
    departure: 'Leaving this page may leave the upload outcome unknown. A job may still validate and charge credits.',
    remove: 'Remove file',
    replace: 'Replace file',
    required: 'Choose a CSV file before uploading.',
    extension: 'Choose a file with a .csv extension.',
    oversized: 'This file exceeds 100 MB. Choose a CSV file of 104,857,600 bytes or less.',
    rejected:
        'The server could not accept this file. Check its CSV format, email column, and 100 MB limit, then choose a corrected file.',
    uncertainTitle: 'Upload could not be confirmed',
    uncertain:
        'We could not confirm the upload or retrieve a job link. A job may still validate and charge credits. Uploading a new file may start another job and charge again.',
    acknowledge: 'I understand that a new upload may start another job and charge again.',
    fresh: 'Choose a fresh file',
    offline: 'You are offline. Reconnect before uploading a CSV file.',
    loading: { title: 'Loading batch verification', description: 'Retrieving the latest status for this batch.' },
    notFound: {
        title: 'Batch verification not found',
        description:
            'This batch is not available to your organization. Check the link. Job links are not retained indefinitely.',
    },
    readError: {
        title: 'Batch status unavailable',
        description:
            'We could not read the latest status. Refreshing the status will not upload another file or start another verification.',
    },
    stale: 'The latest read failed. The displayed progress and counts are the last confirmed update and may be out of date.',
    staleCounts: 'Last confirmed progress and counts — out of date',
    jobOffline:
        'You are offline. Reconnect to refresh the status. Displayed progress and counts are the last confirmed update and may be out of date.',
    validating:
        'The file is being validated. Row counts are not available yet; zero counts do not mean the file is empty.',
    progress: 'Batch verification progress',
    states: {
        queued: {
            title: 'Batch verification queued',
            description: 'Your batch is waiting to run. You can bookmark this page and return to the same job.',
        },
        running: {
            title: 'Batch verification running',
            description: 'Your batch is being validated or processed. Progress and counts are reported by the server.',
        },
        completed: {
            title: 'Batch verification completed',
            description:
                'The batch finished. Download the result CSV to review the individual signals and their limits.',
        },
        failed: {
            title: 'Batch verification failed',
            description:
                'Processing could not finish. Credits may have been charged. Refresh the status or contact support before deciding what to do next.',
        },
        unavailable: {
            title: 'Batch verification unavailable',
            description:
                'The server cannot currently report a trustworthy outcome. Displayed counts may be out of date. Refresh the status or contact support; success, failure, and charging cannot be confirmed.',
        },
    },
    failures: {
        invalid_csv: {
            title: 'CSV validation failed',
            description:
                'The CSV could not be validated. Check the email column and CSV formatting, then choose a corrected file.',
        },
        insufficient_credits: {
            title: 'Insufficient credits',
            description: 'The balance was insufficient when validation of the uploaded file completed.',
        },
        processing_failed: {
            title: 'Batch processing failed',
            description:
                'Processing could not finish. Credits may have been charged. Refresh the status or contact support before deciding what to do next.',
        },
    },
    download: 'Download result CSV',
    downloading: 'Downloading result CSV. No new verification is being started.',
    downloaded: 'Result CSV download requested. No new verification was started or charged.',
    downloadError:
        'The result could not be downloaded. No new verification was started or charged. Try downloading again while the result is available.',
    resultUnavailableTitle: 'Result no longer available',
    resultUnavailable:
        'This result is no longer available to download. Contact support if you need help. No new verification was started or charged.',
} as const
