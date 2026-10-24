import { useId, useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { flushSync } from 'react-dom'
import { Navigate, useLocation, useSearchParams } from 'react-router-dom'
import type { CurrentAccount } from '../../api/current-account'
import { useDocumentTitle } from '../../app/useDocumentTitle'
import { ProductPanel } from '../../shared/ProductPanel'
import { useBrowserAvailability } from '../../shared/use-browser-availability'
import action from '../../shared/Action.module.css'
import form from '../../shared/Form.module.css'
import { useAuth } from '../auth/use-auth'
import { TeamDialog } from '../team/TeamDialog'
import type { CreateServiceClient, ServiceClient } from './service-clients-api'
import { serviceClientsCopy as copy } from './service-clients-copy'
import { useServiceClients } from './use-service-clients'
import styles from './ServiceClientsView.module.css'

type Confirmation = { kind: 'rotate' | 'disable' | 'delete'; client: ServiceClient }

function CreateForm({
    grants,
    busy,
    submit,
}: {
    grants: CurrentAccount['grantableServiceClientPermissions']
    busy: boolean
    submit: (body: CreateServiceClient) => void
}) {
    const id = useId()
    const [description, setDescription] = useState('')
    const [permissions, setPermissions] = useState<CreateServiceClient['permissions']>([])
    const [error, setError] = useState<'permissions' | 'description' | null>(null)
    const formRef = useRef<HTMLFormElement>(null)
    return (
        <section className={styles.create} aria-labelledby={`${id}-heading`}>
            <h2 id={`${id}-heading`}>{copy.create}</h2>
            <form
                ref={formRef}
                className={styles.createForm}
                noValidate
                onSubmit={event => {
                    event.preventDefault()
                    if (busy || grants.length === 0) return
                    const selected = grants.filter(permission => permissions.includes(permission))
                    const invalid =
                        description.trim().length > 200 ? 'description' : selected.length === 0 ? 'permissions' : null
                    setError(invalid)
                    if (invalid) {
                        formRef.current
                            ?.querySelector<HTMLInputElement>(
                                invalid === 'description' ? '[name="description"]' : '[type="checkbox"]',
                            )
                            ?.focus()
                        return
                    }
                    submit({
                        ...(description.trim() ? { description: description.trim() } : {}),
                        permissions: selected,
                    })
                }}
            >
                <div className={form.field}>
                    <label className={form.label} htmlFor={`${id}-description`}>
                        {copy.descriptionLabel}
                    </label>
                    <input
                        id={`${id}-description`}
                        name="description"
                        className={form.control}
                        value={description}
                        autoComplete="off"
                        disabled={busy}
                        aria-invalid={error === 'description'}
                        aria-describedby={error === 'description' ? `${id}-description-error` : undefined}
                        onChange={event => setDescription(event.target.value)}
                    />
                    {error === 'description' ? (
                        <p id={`${id}-description-error`} className={form.error}>
                            {copy.descriptionError}
                        </p>
                    ) : null}
                </div>
                <fieldset
                    className={styles.permissions}
                    disabled={busy}
                    aria-describedby={`${id}-permissions-help${error === 'permissions' ? ` ${id}-permissions-error` : ''}`}
                >
                    <legend className={form.label}>{copy.permissions}</legend>
                    <p id={`${id}-permissions-help`} className={form.help}>
                        {copy.permissionsHelp}
                    </p>
                    {grants.map(permission => (
                        <label key={permission} className={styles.permission}>
                            <input
                                type="checkbox"
                                value={permission}
                                checked={permissions.includes(permission)}
                                aria-invalid={error === 'permissions'}
                                aria-describedby={error === 'permissions' ? `${id}-permissions-error` : undefined}
                                onChange={event =>
                                    setPermissions(previous =>
                                        event.target.checked
                                            ? [...previous, permission]
                                            : previous.filter(value => value !== permission),
                                    )
                                }
                            />
                            <span>{permission}</span>
                        </label>
                    ))}
                    {error === 'permissions' ? (
                        <p id={`${id}-permissions-error`} className={form.error}>
                            {copy.permissionsError}
                        </p>
                    ) : null}
                    {!grants.length ? <p>{copy.unavailableGrants}</p> : null}
                </fieldset>
                <div className={form.actions}>
                    <button type="submit" className={action.action} disabled={busy || grants.length === 0}>
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

function ClientList({
    feature,
    busy,
    requestConfirmation,
}: {
    feature: ReturnType<typeof useServiceClients>
    busy: boolean
    requestConfirmation: (confirmation: Confirmation) => void
}) {
    const [params, setParams] = useSearchParams()
    const clients = feature.clients.data ?? []
    const lastPage = Math.max(1, Math.ceil(clients.length / 10))
    const requestedPage = Number(params.get('page'))
    const page = Number.isSafeInteger(requestedPage) && requestedPage > 0 ? Math.min(requestedPage, lastPage) : 1
    const start = (page - 1) * 10
    function goToPage(next: number) {
        const updated = new URLSearchParams(params)
        if (next === 1) updated.delete('page')
        else updated.set('page', String(next))
        setParams(updated)
    }
    return (
        <>
            {feature.clients.data?.length === 0 ? <p>{copy.empty}</p> : null}
            {clients.length ? (
                <>
                    <table className={styles.table}>
                        <caption
                            className={styles.caption}
                        >{`API keys ${start + 1}–${Math.min(start + 10, clients.length)} of ${clients.length}`}</caption>
                        <thead>
                            <tr>
                                {[
                                    copy.keyPrefix,
                                    'Description',
                                    copy.permissions,
                                    'Status',
                                    'Timestamps',
                                    'Actions',
                                ].map(label => (
                                    <th key={label} scope="col">
                                        {label}
                                    </th>
                                ))}
                            </tr>
                        </thead>
                        <tbody>
                            {clients.slice(start, start + 10).map(client => (
                                <tr key={client.id}>
                                    <Cell label={copy.keyPrefix}>{client.keyPrefix}</Cell>
                                    <Cell label="Description">{client.description || copy.noDescription}</Cell>
                                    <Cell label={copy.permissions}>
                                        <ul className={styles.permissionList}>
                                            {client.permissions.map(permission => (
                                                <li key={permission}>{permission}</li>
                                            ))}
                                        </ul>
                                    </Cell>
                                    <Cell label="Status">
                                        <strong>{copy.status[client.status]}</strong>
                                    </Cell>
                                    <Cell label="Timestamps">
                                        <div>
                                            Created <DateValue value={client.createdAt} />
                                        </div>
                                        <div>
                                            Updated <DateValue value={client.updatedAt} />
                                        </div>
                                    </Cell>
                                    <Cell label="Actions">
                                        <div className={styles.rowActions}>
                                            {client.status === 'active' ? (
                                                <>
                                                    <button
                                                        type="button"
                                                        className={`${action.action} ${action.secondary}`}
                                                        disabled={busy || feature.operation.unknown !== null}
                                                        aria-label={`Rotate API key ${client.keyPrefix}`}
                                                        onClick={() => requestConfirmation({ kind: 'rotate', client })}
                                                    >
                                                        {copy.rotate}
                                                    </button>
                                                    <button
                                                        type="button"
                                                        className={`${action.action} ${action.secondary}`}
                                                        disabled={busy}
                                                        aria-label={`Disable API key ${client.keyPrefix}`}
                                                        onClick={() => requestConfirmation({ kind: 'disable', client })}
                                                    >
                                                        {copy.disable}
                                                    </button>
                                                </>
                                            ) : null}
                                            <button
                                                type="button"
                                                className={`${action.action} ${action.secondary}`}
                                                disabled={busy}
                                                aria-label={`Delete API key ${client.keyPrefix}`}
                                                onClick={() => requestConfirmation({ kind: 'delete', client })}
                                            >
                                                {copy.delete}
                                            </button>
                                        </div>
                                    </Cell>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                    {lastPage > 1 ? (
                        <nav className={styles.pagination} aria-label="API key pages">
                            <button
                                type="button"
                                className={`${action.action} ${action.secondary}`}
                                disabled={page === 1 || busy}
                                onClick={() => goToPage(page - 1)}
                            >
                                {copy.previous}
                            </button>
                            <button
                                type="button"
                                className={`${action.action} ${action.secondary}`}
                                disabled={page === lastPage || busy}
                                onClick={() => goToPage(page + 1)}
                            >
                                {copy.next}
                            </button>
                        </nav>
                    ) : null}
                </>
            ) : null}
        </>
    )
}

function ConfirmationDialog({
    value,
    dismiss,
    requestConfirmation,
}: {
    value: Confirmation
    dismiss: () => void
    requestConfirmation: () => void
}) {
    const title =
        value.kind === 'rotate' ? copy.rotateTitle : value.kind === 'disable' ? copy.disableTitle : copy.deleteTitle
    const consequence =
        value.kind === 'rotate'
            ? copy.rotateConsequence
            : value.kind === 'disable'
              ? copy.disableConsequence
              : copy.deleteConsequence
    return (
        <TeamDialog title={title} description={`${value.client.keyPrefix}: ${consequence}`} onDismiss={dismiss}>
            <div className={form.actions}>
                <button
                    type="button"
                    data-initial-focus
                    className={`${action.action} ${action.secondary}`}
                    onClick={dismiss}
                >
                    {copy.cancel}
                </button>
                <button type="button" className={action.action} onClick={requestConfirmation}>
                    {copy[value.kind]}
                </button>
            </div>
        </TeamDialog>
    )
}

function SecretDialog({ feature }: { feature: ReturnType<typeof useServiceClients> }) {
    const id = useId()
    const input = useRef<HTMLInputElement>(null)
    const [revealed, setRevealed] = useState(false)
    const { readSecret } = feature
    useLayoutEffect(() => {
        const element = input.current!
        element.value = readSecret()
        return () => {
            element.value = ''
        }
    }, [readSecret])
    return (
        <TeamDialog title={copy.secretTitle} description={copy.secretDescription} onDismiss={feature.dismiss}>
            <p>
                {copy.keyPrefix}: {feature.operation.issuedKeyPrefix}
            </p>
            <div className={form.field}>
                <label className={form.label} htmlFor={id}>
                    {copy.secretLabel}
                </label>
                <input
                    ref={input}
                    id={id}
                    className={form.control}
                    type={revealed ? 'text' : 'password'}
                    readOnly
                    autoComplete="off"
                    spellCheck={false}
                />
                <button
                    type="button"
                    className={`${action.action} ${action.secondary}`}
                    aria-pressed={revealed}
                    onClick={() => setRevealed(value => !value)}
                >
                    {revealed ? copy.hide : copy.show}
                </button>
            </div>
            <p role="status" className={styles.feedback}>
                {feature.operation.notice}
            </p>
            <div className={form.actions}>
                <button
                    type="button"
                    data-initial-focus
                    className={`${action.action} ${action.secondary}`}
                    onClick={feature.dismiss}
                >
                    {copy.close}
                </button>
                <button
                    type="button"
                    className={action.action}
                    disabled={feature.operation.pending === 'copy'}
                    onClick={() => void feature.copySecret()}
                >
                    {copy.copy}
                </button>
                <button
                    type="button"
                    className={`${action.action} ${action.secondary}`}
                    disabled={feature.operation.pending === 'copy'}
                    onClick={feature.download}
                >
                    {copy.download}
                </button>
            </div>
        </TeamDialog>
    )
}

function ServiceClientsContent({ account }: { account: CurrentAccount }) {
    useDocumentTitle(`${copy.title} | Lead Email Finder`)
    const feature = useServiceClients(account.organization.id)
    const location = useLocation()
    const previousLocationKey = useRef(location.key)
    const { online } = useBrowserAvailability()
    const [confirmation, setConfirmation] = useState<Confirmation | null>(null)
    const [formVersion, setFormVersion] = useState(0)
    const busy = feature.operation.pending !== null || !online
    const feedback = useRef<HTMLDivElement>(null)
    const operationTrigger = useRef<HTMLElement | null>(null)
    const { dismiss } = feature
    useLayoutEffect(() => {
        if (previousLocationKey.current === location.key) return
        previousLocationKey.current = location.key
        // Navigation clears ephemeral credentials and drafts, while preserving the
        // secret-free reconciliation guard across changes to the list's page.
        dismiss()
        setConfirmation(null)
        setFormVersion(version => version + 1)
    }, [location.key, dismiss])
    useLayoutEffect(() => {
        const forget = () =>
            flushSync(() => {
                setConfirmation(null)
                setFormVersion(version => version + 1)
            })
        const restore = (event: PageTransitionEvent) => {
            if (event.persisted) forget()
        }
        window.addEventListener('pagehide', forget)
        window.addEventListener('pageshow', restore)
        return () => {
            window.removeEventListener('pagehide', forget)
            window.removeEventListener('pageshow', restore)
        }
    }, [])
    useLayoutEffect(() => {
        if (feature.operation.notice === copy.closed) {
            if (!feature.clients.isFetching && operationTrigger.current?.isConnected) operationTrigger.current.focus()
        } else if (!feature.operation.issuedKeyPrefix && (feature.operation.notice || feature.operation.unknown))
            feedback.current?.focus()
    }, [
        feature.operation.notice,
        feature.operation.unknown,
        feature.operation.issuedKeyPrefix,
        feature.clients.isFetching,
    ])
    return (
        <>
            <header className={styles.header}>
                <h1>{copy.title}</h1>
                <p>{copy.description}</p>
            </header>
            {!online ? <p role="status">{copy.offline}</p> : null}
            <CreateForm
                key={formVersion}
                grants={account.grantableServiceClientPermissions}
                busy={busy || feature.operation.unknown !== null}
                submit={body => {
                    operationTrigger.current =
                        document.activeElement instanceof HTMLElement ? document.activeElement : null
                    void feature.create(body)
                }}
            />
            <ProductPanel
                title={copy.list}
                description={copy.listDescription}
                pending={feature.clients.isPending}
                refreshing={feature.clients.isFetching}
                failed={feature.clients.isError}
                reserveContent
                retry={() => void feature.clients.refetch()}
                headerAction={
                    <button
                        type="button"
                        className={`${action.action} ${action.secondary}`}
                        disabled={busy || feature.clients.isFetching}
                        onClick={() => void feature.clients.refetch()}
                    >
                        {copy.refresh}
                    </button>
                }
                feedback={
                    <div ref={feedback} tabIndex={-1} className={styles.operationFeedback}>
                        {feature.operation.pending && feature.operation.pending !== 'copy' ? (
                            <>
                                <p>{copy.pending}</p>
                                <button
                                    type="button"
                                    className={`${action.action} ${action.secondary}`}
                                    onClick={feature.dismiss}
                                >
                                    {copy.cancelWaiting}
                                </button>
                            </>
                        ) : null}
                        {feature.operation.unknown ? (
                            <>
                                <h3>{copy.unknown}</h3>
                                <p>
                                    {feature.operation.unknown === 'create' ? copy.createUnknown : copy.rotateUnknown}
                                </p>
                                <button
                                    type="button"
                                    className={`${action.action} ${action.secondary}`}
                                    disabled={
                                        busy ||
                                        feature.clients.isFetching ||
                                        feature.clients.isError ||
                                        !feature.clients.data
                                    }
                                    onClick={feature.reviewed}
                                >
                                    {copy.reviewed}
                                </button>
                            </>
                        ) : null}
                        {!feature.operation.issuedKeyPrefix ? feature.operation.notice : null}
                    </div>
                }
            >
                <ClientList
                    feature={feature}
                    busy={busy || feature.clients.isFetching}
                    requestConfirmation={value => {
                        operationTrigger.current =
                            document.activeElement instanceof HTMLElement ? document.activeElement : null
                        setConfirmation(value)
                    }}
                />
            </ProductPanel>
            {confirmation ? (
                <ConfirmationDialog
                    value={confirmation}
                    dismiss={() => setConfirmation(null)}
                    requestConfirmation={() => {
                        const { kind, client } = confirmation
                        setConfirmation(null)
                        if (kind === 'rotate') void feature.rotate(client.id)
                        else if (kind === 'disable') void feature.disable(client.id)
                        else void feature.remove(client.id)
                    }}
                />
            ) : null}
            {feature.operation.issuedKeyPrefix ? <SecretDialog feature={feature} /> : null}
        </>
    )
}

export function ServiceClientsPage() {
    const { state } = useAuth()
    if (state.status !== 'authenticated') return null
    if (!state.account.capabilities.includes('service_clients.manage')) return <Navigate replace to="/app/forbidden" />
    return (
        <ServiceClientsContent
            key={`${state.account.organization.id}:${state.account.membership.id}`}
            account={state.account}
        />
    )
}
