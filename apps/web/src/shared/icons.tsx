import type { PrincipleIconName, SignalIconName } from '../content/public-entry'

type IconName = SignalIconName | PrincipleIconName

interface IconProps {
    name: IconName
    className?: string
}

export function Icon({ name, className }: IconProps) {
    const commonProps = {
        className,
        viewBox: '0 0 48 48',
        fill: 'none',
        stroke: 'currentColor',
        strokeWidth: 2,
        strokeLinecap: 'round' as const,
        strokeLinejoin: 'round' as const,
        'aria-hidden': true,
        focusable: false,
    }

    switch (name) {
        case 'syntax':
            return (
                <svg {...commonProps}>
                    <path d="m17 13-9 11 9 11M31 13l9 11-9 11M28 8l-8 32" />
                </svg>
            )
        case 'domain':
            return (
                <svg {...commonProps}>
                    <circle cx="24" cy="24" r="17" />
                    <path d="M7 24h34M24 7c5 5 8 10.7 8 17s-3 12-8 17M24 7c-5 5-8 10.7-8 17s3 12 8 17" />
                </svg>
            )
        case 'mx':
            return (
                <svg {...commonProps}>
                    <rect x="8" y="9" width="32" height="11" rx="1" />
                    <rect x="8" y="28" width="32" height="11" rx="1" />
                    <path d="M14 14.5h.01M14 33.5h.01M21 14.5h13M21 33.5h13" />
                </svg>
            )
        case 'lock':
            return (
                <svg {...commonProps}>
                    <rect x="10" y="20" width="28" height="22" rx="2" />
                    <path d="M16 20v-5a8 8 0 0 1 16 0v5M24 28v6" />
                </svg>
            )
        case 'respect':
            return (
                <svg {...commonProps}>
                    <path d="M24 5c5 4 10 6 16 7v11c0 10-6.5 16.5-16 20-9.5-3.5-16-10-16-20V12c6-1 11-3 16-7Z" />
                    <path d="M24 15v18" />
                </svg>
            )
        case 'transparency':
            return (
                <svg {...commonProps}>
                    <circle cx="20" cy="20" r="12" />
                    <path d="m29 29 12 12" />
                </svg>
            )
        case 'minimalism':
            return (
                <svg {...commonProps}>
                    <path d="M39 7C22 7 10 15 9 30c8 4 19 1 25-7 4-5 5-10 5-16Z" />
                    <path d="M6 41c7-12 15-20 28-27" />
                </svg>
            )
        case 'responsibility':
            return (
                <svg {...commonProps}>
                    <path d="M24 8v33M13 13h22M10 18 4 31h12L10 18ZM38 18l-6 13h12l-6-13ZM5 31c1 4 9 4 10 0M33 31c1 4 9 4 10 0M17 41h14" />
                </svg>
            )
    }
}

export function BrandGlyph({ className }: { className?: string }) {
    return (
        <svg className={className} viewBox="0 0 44 52" aria-hidden="true" focusable="false">
            <path d="M22 14 8 25v15l14 10V14Z" fill="currentColor" opacity="0.72" />
            <path d="M24 12 38 2v20L24 33V12Z" fill="currentColor" />
            <path d="m24 36 14-11v15L24 50V36Z" fill="currentColor" opacity="0.88" />
            <path d="M20 10 8 18v4l12-9v-3Z" fill="var(--color-canvas)" />
        </svg>
    )
}

export function CircuitBackdrop({ className }: { className?: string }) {
    return (
        <svg className={className} viewBox="0 0 760 270" aria-hidden="true" focusable="false">
            <g fill="none" stroke="currentColor" strokeWidth="1.1">
                <path d="M18 154V83c0-18 15-33 33-33h176c18 0 33-15 33-33" strokeDasharray="3 6" />
                <path d="M18 154h93c18 0 33 15 33 33v22" strokeDasharray="3 6" />
                <path d="M112 154v-40c0-18 15-33 33-33h148" />
                <path d="M265 81V59c0-18 15-33 33-33h231c18 0 33 15 33 33v102" />
                <path d="M323 81v61c0 18 15 33 33 33h86" strokeDasharray="3 6" />
                <path d="M442 175h102c18 0 33-15 33-33V0" />
                <path d="M486 228v-29c0-13 11-24 24-24h45" />
                <path d="M577 142h33c18 0 33-15 33-33V48" />
                <path d="M529 26h116c18 0 33 15 33 33v133" strokeDasharray="3 6" />
                <path d="M704 41v159" />
            </g>
            <g fill="var(--color-canvas)" stroke="currentColor" strokeWidth="1.3">
                <circle cx="18" cy="154" r="4" />
                <circle cx="112" cy="154" r="4" />
                <circle cx="144" cy="209" r="4" />
                <circle cx="293" cy="81" r="4" />
                <circle cx="442" cy="175" r="4" />
                <circle cx="529" cy="26" r="4" />
                <circle cx="577" cy="142" r="4" />
                <circle cx="643" cy="48" r="4" />
                <circle cx="704" cy="200" r="4" />
            </g>
        </svg>
    )
}
