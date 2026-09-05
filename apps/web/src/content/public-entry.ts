const brand = 'Lead Email Finder'

export const publicEntryCopy = {
    brand,
    accessibility: {
        brandHomeLabel: `${brand} home`,
        skipToMain: 'Skip to main content',
    },
    documentTitle: 'Lead Email Finder | Verify the signal before you send.',
    navigationLabel: 'Primary navigation',
    navigation: [
        { label: 'How it works', target: 'how-it-works' },
        { label: 'Signals', target: 'signals' },
        { label: 'Principles', target: 'principles' },
    ],
    hero: {
        title: 'Verify the signal before you send.',
        titleLines: ['Verify the signal', 'before you send.'],
        introduction:
            'Lead Email Finder checks syntax, domain, MX, and secure SMTP signals to help you assess deliverability—so you send with confidence.',
        callout: 'A signal, not permission.',
        calloutBody: 'A deliverability signal does not grant permission to contact someone.',
        continueLink: 'Continue to the principles',
    },
    signals: {
        heading: 'Verification signals',
        items: [
            {
                name: 'Syntax',
                description: 'Check the address format and structure.',
                icon: 'syntax',
            },
            {
                name: 'Domain',
                description: 'Verify the domain exists and is valid.',
                icon: 'domain',
            },
            {
                name: 'MX',
                description: 'Confirm the domain accepts email.',
                icon: 'mx',
            },
            {
                name: 'Secure SMTP',
                description: 'Establish a secure connection and verify mailbox acceptance.',
                icon: 'lock',
            },
        ],
    },
    principles: {
        heading: 'Our principles guide every signal.',
        introduction:
            'We measure technical deliverability signals with care and clarity—so you can build outreach that earns trust.',
        returnLink: 'Back to how it works',
        items: [
            {
                name: 'Respect',
                description: 'People are not targets. Signals do not grant permission. You decide what is appropriate.',
                icon: 'respect',
            },
            {
                name: 'Transparency',
                description: 'We check what matters: syntax, domain, MX, and secure SMTP. No hidden steps.',
                icon: 'transparency',
            },
            {
                name: 'Minimalism',
                description: 'We collect and show only what is required to assess technical deliverability.',
                icon: 'minimalism',
            },
            {
                name: 'Responsibility',
                description: 'You follow the law, your policies, and your values. Always.',
                icon: 'responsibility',
            },
        ],
    },
    footer: 'We verify technical deliverability signals so you can send with confidence—and with respect.',
} as const

export const notFoundCopy = {
    documentTitle: 'Page not found | Lead Email Finder',
    title: 'This signal ends here.',
    description: 'The page you requested does not exist or has moved.',
    guidance: 'Return to the public entry and follow a working path.',
    homeLink: 'Back to home',
} as const

export type SignalIconName = (typeof publicEntryCopy.signals.items)[number]['icon']
export type PrincipleIconName = (typeof publicEntryCopy.principles.items)[number]['icon']
