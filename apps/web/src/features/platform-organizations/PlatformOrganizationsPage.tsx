import { useId, useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { Navigate, useLocation } from 'react-router-dom'
import { ApiError } from '../../api/api-error'
import { useDocumentTitle } from '../../app/useDocumentTitle'
import { ProductPanel } from '../../shared/ProductPanel'
import { useBrowserAvailability } from '../../shared/use-browser-availability'
import action from '../../shared/Action.module.css'
import form from '../../shared/Form.module.css'
import { useAuth } from '../auth/use-auth'
import { TeamDialog } from '../team/TeamDialog'
import styles from '../service-clients/ServiceClientsView.module.css'
import { organizationsCopy as copy } from './platform-organizations-copy'
import type { CreateOrganization, DirectoryOrganization } from './platform-organizations-api'
import { usePlatformOrganizations } from './use-platform-organizations'

function CreateForm({ busy, submit }: { busy: boolean; submit: (body: CreateOrganization) => void }) {
    const id = useId()
    const formRef = useRef<HTMLFormElement>(null)
    const [error, setError] = useState<'name' | 'ownerEmail' | null>(null)
    useLayoutEffect(() => {
        const element = formRef.current!
        return () => {
            element.reset()
        }
    }, [])
    return (
        <section className={styles.create} aria-labelledby={`${id}-title`}>
            <h2 id={`${id}-title`}>{copy.create}</h2>
            <p>{copy.createDescription}</p>
            <form
                ref={formRef}
                noValidate
                className={styles.createForm}
                onSubmit={event => {
                    event.preventDefault()
                    if (busy) return
                    const name = formRef.current!.elements.namedItem('name') as HTMLInputElement
                    const email = formRef.current!.elements.namedItem('ownerEmail') as HTMLInputElement
                    const invalid =
                        name.value.trim().length < 1 || name.value.trim().length > 200
                            ? 'name'
                            : !email.value.trim() || !email.validity.valid
                              ? 'ownerEmail'
                              : null
                    setError(invalid)
                    if (invalid) {
                        ;(invalid === 'name' ? name : email).focus()
                        return
                    }
                    submit({ name: name.value.trim(), ownerEmail: email.value.trim() })
                    formRef.current!.reset()
                }}
            >
                {(['name', 'ownerEmail'] as const).map(field => (
                    <div className={form.field} key={field}>
                        <label className={form.label} htmlFor={`${id}-${field}`}>
                            {copy[field]}
                        </label>
                        <input
                            id={`${id}-${field}`}
                            name={field}
                            type={field === 'ownerEmail' ? 'email' : 'text'}
                            className={form.control}
                            required
                            autoComplete="off"
                            disabled={busy}
                            aria-invalid={error === field}
                            aria-describedby={error === field ? `${id}-${field}-error` : undefined}
                        />
                        {error === field ? (
                            <p id={`${id}-${field}-error`} className={form.error}>
                                {field === 'name' ? copy.nameError : copy.emailError}
                            </p>
                        ) : null}
                    </div>
                ))}
                <div className={form.actions}>
                    <button data-create-organization type="submit" className={action.action} disabled={busy}>
                        {copy.create}
                    </button>
                </div>
            </form>
        </section>
    )
}

function Cell({ label, children }: { label: string; children: ReactNode }) {
    return (
        <td>
            <span className={styles.mobileLabel} aria-hidden="true">
                {label}
            </span>
            <div>{children}</div>
        </td>
    )
}
const dateFormat = new Intl.DateTimeFormat('en', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'UTC' })
function DateValue({ value }: { value: string }) {
    const date = new Date(value)
    return Number.isNaN(date.getTime()) ? (
        copy.dateUnavailable
    ) : (
        <time dateTime={value}>{dateFormat.format(date)} UTC</time>
    )
}

function Directory({ organizations }: { organizations: DirectoryOrganization[] }) {
    return (
        <table className={styles.table}>
            <caption className={styles.caption}>{copy.directory}</caption>
            <thead>
                <tr>
                    {[copy.directoryName, copy.id, copy.createdAt, copy.updatedAt].map(label => (
                        <th key={label} scope="col">
                            {label}
                        </th>
                    ))}
                </tr>
            </thead>
            <tbody>
                {organizations.map(organization => (
                    <tr key={organization.id}>
                        <Cell label={copy.directoryName}>{organization.name}</Cell>
                        <Cell label={copy.id}>{organization.id}</Cell>
                        <Cell label={copy.createdAt}>
                            <DateValue value={organization.createdAt} />
                        </Cell>
                        <Cell label={copy.updatedAt}>
                            <DateValue value={organization.updatedAt} />
                        </Cell>
                    </tr>
                ))}
            </tbody>
        </table>
    )
}

function InvitationDialog({ feature }: { feature: ReturnType<typeof usePlatformOrganizations> }) {
    const id = useId()
    const input = useRef<HTMLInputElement>(null)
    const { readInvitation } = feature
    useLayoutEffect(() => {
        const element = input.current!
        element.value = readInvitation()
        return () => {
            element.value = ''
        }
    }, [readInvitation])
    return (
        <TeamDialog title={copy.secretTitle} description={copy.secretDescription} onDismiss={() => feature.dismiss()}>
            <div className={form.field}>
                <label className={form.label} htmlFor={id}>
                    {copy.secretLabel}
                </label>
                <input
                    ref={input}
                    id={id}
                    className={form.control}
                    readOnly
                    autoComplete="off"
                    spellCheck={false}
                    onCopy={event => {
                        event.preventDefault()
                        event.clipboardData.setData('text/plain', readInvitation())
                        feature.copied()
                    }}
                />
            </div>
            <p role="status" className={styles.feedback}>
                {feature.operation.notice}
            </p>
            <div className={form.actions}>
                <button
                    type="button"
                    className={`${action.action} ${action.secondary}`}
                    onClick={() => feature.dismiss()}
                >
                    {copy.close}
                </button>
                <button
                    type="button"
                    data-initial-focus
                    className={action.action}
                    disabled={feature.operation.pending === 'copy'}
                    onClick={() => void feature.copyInvitation()}
                >
                    {copy.copy}
                </button>
            </div>
        </TeamDialog>
    )
}

function OrganizationsContent({ membershipId }: { membershipId: string }) {
    useDocumentTitle(`${copy.title} | Lead Email Finder`)
    const feature = usePlatformOrganizations(membershipId)
    const { online } = useBrowserAvailability()
    const location = useLocation()
    const previousLocation = useRef(location.key)
    const trigger = useRef<HTMLElement | null>(null)
    const { dismiss } = feature
    useLayoutEffect(() => {
        if (previousLocation.current !== location.key) {
            previousLocation.current = location.key
            dismiss()
        }
    }, [location.key, dismiss])
    useLayoutEffect(() => {
        if (feature.operation.notice === copy.dismissed || feature.operation.notice === copy.copied) {
            const target = trigger.current?.isConnected
                ? trigger.current
                : document.querySelector<HTMLElement>('[data-create-organization]')
            target?.focus()
        }
    }, [feature.operation.notice])
    const organizations = [
        ...new Map(
            feature.directory.data?.pages
                .flatMap(page => page.organizations)
                .map(organization => [organization.id, organization]),
        ).values(),
    ]
    const invalidCursor = feature.directory.error instanceof ApiError && feature.directory.error.status === 400
    const busy = feature.operation.pending !== null || feature.operation.issued || !online
    return (
        <>
            <header className={styles.header}>
                <h1>{copy.title}</h1>
                <p>{copy.description}</p>
            </header>
            {!online ? <p role="status">{copy.offline}</p> : null}
            <CreateForm
                key={feature.formVersion}
                busy={busy || feature.unknown}
                submit={body => {
                    trigger.current = document.activeElement instanceof HTMLElement ? document.activeElement : null
                    void feature.create(body)
                }}
            />
            <ProductPanel
                title={copy.directory}
                description={copy.directoryDescription}
                pending={feature.directory.isPending}
                refreshing={feature.directory.isFetching}
                failed={feature.directory.isError && !invalidCursor && !feature.directory.isFetchNextPageError}
                retry={() => void feature.refresh()}
                reserveContent
                headerAction={
                    <button
                        type="button"
                        className={`${action.action} ${action.secondary}`}
                        disabled={!online || feature.directory.isFetching || busy}
                        onClick={() => void feature.refresh()}
                    >
                        {copy.refresh}
                    </button>
                }
                feedback={
                    <>
                        {invalidCursor ? (
                            <p>{copy.invalidCursor}</p>
                        ) : feature.directory.isFetchNextPageError ? (
                            <p>{copy.moreFailed}</p>
                        ) : null}
                        {feature.directory.isFetchingNextPage ? <p>{copy.loadingMore}</p> : null}
                        <div className={styles.operationFeedback}>
                            {feature.operation.pending === 'create'
                                ? copy.creating
                                : feature.operation.issued
                                  ? ''
                                  : feature.operation.notice}
                        </div>
                        {feature.operation.pending === 'create' ? (
                            <button
                                type="button"
                                className={`${action.action} ${action.secondary}`}
                                onClick={() => feature.dismiss()}
                            >
                                {copy.cancel}
                            </button>
                        ) : null}
                        {feature.unknown ? (
                            <>
                                <p>{copy.unknown}</p>
                                <button
                                    type="button"
                                    className={`${action.action} ${action.secondary}`}
                                    disabled={
                                        !online ||
                                        feature.directory.isFetching ||
                                        feature.directory.isError ||
                                        !feature.directory.data
                                    }
                                    onClick={feature.reviewed}
                                >
                                    {copy.reviewed}
                                </button>
                            </>
                        ) : null}
                    </>
                }
            >
                {feature.directory.data && organizations.length === 0 ? <p>{copy.empty}</p> : null}
                {organizations.length ? <Directory organizations={organizations} /> : null}
                {feature.directory.hasNextPage ? (
                    <div className={styles.pagination}>
                        <button
                            type="button"
                            className={`${action.action} ${action.secondary}`}
                            disabled={!online || feature.directory.isFetching || busy || invalidCursor}
                            onClick={() => void feature.directory.fetchNextPage()}
                        >
                            {copy.loadMore}
                        </button>
                    </div>
                ) : null}
            </ProductPanel>
            {feature.operation.issued ? <InvitationDialog feature={feature} /> : null}
        </>
    )
}

export function PlatformOrganizationsPage() {
    const { state } = useAuth()
    if (state.status !== 'authenticated') return null
    if (!state.account.capabilities.includes('platform.organizations.manage'))
        return <Navigate replace to="/app/forbidden" />
    return <OrganizationsContent key={state.account.membership.id} membershipId={state.account.membership.id} />
}
