import { useQuery } from '@tanstack/react-query'
import { useId, useLayoutEffect, useRef, useState } from 'react'
import { Link, Navigate } from 'react-router-dom'
import { ApiError } from '../../api/api-error'
import { useDocumentTitle } from '../../app/useDocumentTitle'
import { ProductPanel } from '../../shared/ProductPanel'
import { useBrowserAvailability } from '../../shared/use-browser-availability'
import action from '../../shared/Action.module.css'
import form from '../../shared/Form.module.css'
import { useAuth } from '../auth/use-auth'
import { TeamDialog } from '../team/TeamDialog'
import table from '../service-clients/ServiceClientsView.module.css'
import { ProxyForm } from './ProxyForm'
import { ProxyRegistry, type ProxyAction } from './ProxyRegistry'
import { proxyDetailKey, readProxy, type ProxyRecord } from './platform-proxies-api'
import { lifecycleCopy, proxyCopy as copy, stateLabels } from './platform-proxies-copy'
import { usePlatformProxies } from './use-platform-proxies'

type Feature = ReturnType<typeof usePlatformProxies>
type Dialog = { version: number } & ({ kind: 'create' } | { kind: ProxyAction; proxy: ProxyRecord })

function BlacklistForm({ feature, proxy, busy }: { feature: Feature; proxy: ProxyRecord; busy: boolean }) {
    const id = useId()
    const input = useRef<HTMLInputElement>(null)
    const [invalid, setInvalid] = useState(false)
    return (
        <form
            noValidate
            autoComplete="off"
            className={table.createForm}
            onSubmit={event => {
                event.preventDefault()
                if (busy) return
                const mxHost = input.current!.value.trim()
                setInvalid(!mxHost)
                if (!mxHost) {
                    input.current!.focus()
                    return
                }
                void feature.run({ kind: 'blacklist', id: proxy.id, mxHost })
            }}
        >
            <div className={form.field}>
                <label className={form.label} htmlFor={id}>
                    {copy.mxHost}
                </label>
                <input
                    ref={input}
                    id={id}
                    name="mx-host"
                    className={form.control}
                    required
                    disabled={busy}
                    aria-invalid={invalid}
                    aria-describedby={invalid ? `${id}-error` : undefined}
                />
                {invalid ? (
                    <p id={`${id}-error`} className={form.error}>
                        Enter an MX host.
                    </p>
                ) : null}
            </div>
            <div className={form.actions}>
                <button type="button" className={`${action.action} ${action.secondary}`} onClick={feature.dismiss}>
                    {feature.pending ? copy.cancelWaiting : copy.cancel}
                </button>
                <button type="submit" className={action.action} disabled={busy}>
                    {copy.report}
                </button>
            </div>
        </form>
    )
}

function DetailDialog({
    selected,
    feature,
    busy,
}: {
    selected: Exclude<Dialog, { kind: 'create' }>
    feature: Feature
    busy: boolean
}) {
    const detail = useQuery({
        queryKey: proxyDetailKey(selected.proxy.id),
        queryFn: ({ signal }) => readProxy(feature.api, selected.proxy.id, signal),
        retry: false,
        staleTime: 0,
    })
    const lifecycle =
        selected.kind === 'active' || selected.kind === 'draining' || selected.kind === 'disabled'
            ? selected.kind
            : null
    const title = lifecycle
        ? lifecycleCopy[lifecycle].title
        : selected.kind === 'edit'
          ? copy.edit
          : selected.kind === 'delete'
            ? copy.delete
            : copy.blacklist
    const description = lifecycle
        ? lifecycleCopy[lifecycle].consequence
        : selected.kind === 'edit'
          ? copy.editDescription
          : selected.kind === 'delete'
            ? copy.deleteDescription
            : copy.blacklistDescription
    const proxy = detail.data
    const error = detail.error instanceof ApiError ? detail.error.status : 0
    return (
        <TeamDialog
            key={detail.isPending ? 'pending' : detail.isError ? 'failed' : 'ready'}
            title={title}
            description={`${proxy?.host ?? selected.proxy.host}:${proxy?.port ?? selected.proxy.port}. ${description}`}
            onDismiss={feature.dismiss}
        >
            {detail.isPending ? (
                <>
                    <p role="status">{copy.loadingDetail}</p>
                    <button
                        type="button"
                        data-initial-focus
                        className={`${action.action} ${action.secondary}`}
                        onClick={feature.dismiss}
                    >
                        {copy.cancel}
                    </button>
                </>
            ) : null}
            {detail.isError ? (
                <>
                    <p role="alert">{error === 404 ? copy.missing : error === 403 ? copy.denied : copy.failedDetail}</p>
                    <div className={form.actions}>
                        <button
                            type="button"
                            data-initial-focus
                            className={`${action.action} ${action.secondary}`}
                            onClick={feature.dismiss}
                        >
                            {copy.cancel}
                        </button>
                        {![403, 404].includes(error) ? (
                            <button
                                type="button"
                                className={action.action}
                                disabled={detail.isFetching}
                                onClick={() => void detail.refetch()}
                            >
                                Try again
                            </button>
                        ) : null}
                    </div>
                </>
            ) : null}
            {!detail.isError && proxy ? (
                selected.kind === 'edit' ? (
                    <ProxyForm
                        proxy={proxy}
                        busy={busy || detail.isFetching}
                        dismiss={feature.dismiss}
                        dismissCredentials={() => {
                            if (feature.pending) feature.dismiss()
                        }}
                        submit={body => void feature.run({ kind: 'update', id: proxy.id, body })}
                    />
                ) : selected.kind === 'blacklist' ? (
                    <BlacklistForm feature={feature} proxy={proxy} busy={busy || detail.isFetching} />
                ) : (
                    <>
                        {lifecycle ? (
                            <p>
                                {stateLabels[proxy.state]} → {stateLabels[lifecycle]}
                            </p>
                        ) : (
                            <p>
                                {proxy.host}:{proxy.port}
                            </p>
                        )}
                        <div className={form.actions}>
                            <button
                                type="button"
                                data-initial-focus
                                className={`${action.action} ${action.secondary}`}
                                onClick={feature.dismiss}
                            >
                                {feature.pending ? copy.cancelWaiting : copy.cancel}
                            </button>
                            <button
                                type="button"
                                className={action.action}
                                disabled={busy || detail.isFetching || proxy.state === lifecycle}
                                onClick={() =>
                                    void feature.run(
                                        lifecycle
                                            ? { kind: 'update', id: proxy.id, body: { state: lifecycle } }
                                            : { kind: 'delete', id: proxy.id },
                                    )
                                }
                            >
                                {lifecycle ? lifecycleCopy[lifecycle].action : copy.delete}
                            </button>
                        </div>
                    </>
                )
            ) : null}
            {feature.pending ? <p role="status">{copy.waiting}</p> : null}
        </TeamDialog>
    )
}

function ProxiesContent({ membershipId }: { membershipId: string }) {
    useDocumentTitle(`${copy.title} | Lead Email Finder`)
    const feature = usePlatformProxies(membershipId)
    const { online } = useBrowserAvailability()
    const [dialog, setDialog] = useState<Dialog | null>(null)
    const feedback = useRef<HTMLDivElement>(null)
    const directory = feature.directory
    const proxies = [
        ...new Map(directory.data?.pages.flatMap(page => page.proxies).map(proxy => [proxy.id, proxy])).values(),
    ]
    const invalidCursor = directory.error instanceof ApiError && directory.error.status === 400
    const denied = directory.error instanceof ApiError && directory.error.status === 403
    const busy =
        feature.pending || feature.unknown || !online || directory.isFetching || directory.isError || !directory.data
    const selected = dialog?.version === feature.formVersion ? dialog : null
    useLayoutEffect(() => {
        if (!feature.pending && (feature.notice || feature.unknown)) feedback.current?.focus()
    }, [feature.pending, feature.notice, feature.unknown])
    return (
        <>
            <header className={table.header}>
                <h1>{copy.title}</h1>
                <p>{copy.description}</p>
            </header>
            {!online ? <p role="status">{copy.offline}</p> : null}
            <ProductPanel
                title={copy.registry}
                description={copy.registryDescription}
                pending={directory.isPending}
                refreshing={directory.isFetching}
                failed={directory.isError && !invalidCursor && !denied && !directory.isFetchNextPageError}
                retry={() => void feature.refresh()}
                reserveContent
                headerAction={
                    <div className={form.actions}>
                        <button
                            type="button"
                            className={`${action.action} ${action.secondary}`}
                            disabled={!online || directory.isFetching || feature.pending}
                            onClick={() => void feature.refresh()}
                        >
                            {copy.refresh}
                        </button>
                        <button
                            type="button"
                            className={action.action}
                            disabled={busy}
                            onClick={() => setDialog({ kind: 'create', version: feature.formVersion })}
                        >
                            {copy.create}
                        </button>
                    </div>
                }
                feedback={
                    <>
                        {denied ? (
                            <p>
                                {copy.denied} <Link to="/app">Back to workspace</Link>
                            </p>
                        ) : invalidCursor ? (
                            <p>{copy.invalidCursor}</p>
                        ) : directory.isFetchNextPageError ? (
                            <p>{copy.moreFailed}</p>
                        ) : null}
                        {directory.isFetchingNextPage ? <p>{copy.loadingMore}</p> : null}
                        <div ref={feedback} tabIndex={-1} className={table.operationFeedback}>
                            <p>{feature.notice}</p>
                            {feature.unknown ? (
                                <>
                                    <p>{copy.unknown}</p>
                                    <button
                                        type="button"
                                        className={`${action.action} ${action.secondary}`}
                                        disabled={
                                            !online || directory.isFetching || directory.isError || !directory.data
                                        }
                                        onClick={feature.reviewed}
                                    >
                                        {copy.reviewed}
                                    </button>
                                </>
                            ) : null}
                        </div>
                    </>
                }
            >
                {!denied && directory.data && !proxies.length ? <p>{copy.empty}</p> : null}
                {!denied && proxies.length ? (
                    <ProxyRegistry
                        proxies={proxies}
                        busy={busy}
                        select={(proxy, kind) => setDialog({ kind, proxy, version: feature.formVersion })}
                    />
                ) : null}
                {directory.hasNextPage && !denied ? (
                    <div className={table.pagination}>
                        <button
                            type="button"
                            className={`${action.action} ${action.secondary}`}
                            disabled={!online || directory.isFetching || feature.pending || invalidCursor}
                            onClick={() => {
                                if (!directory.isFetching) void directory.fetchNextPage({ cancelRefetch: false })
                            }}
                        >
                            {copy.loadMore}
                        </button>
                    </div>
                ) : directory.data && !denied && proxies.length ? (
                    <p className={table.pagination}>{copy.end}</p>
                ) : null}
            </ProductPanel>
            {selected?.kind === 'create' ? (
                <TeamDialog title={copy.create} description={copy.createDescription} onDismiss={feature.dismiss}>
                    <ProxyForm
                        busy={busy}
                        dismiss={feature.dismiss}
                        dismissCredentials={() => {
                            if (feature.pending) feature.dismiss()
                        }}
                        submit={body => void feature.run({ kind: 'create', body: { ...body, state: 'disabled' } })}
                    />
                    {feature.pending ? <p role="status">{copy.waiting}</p> : null}
                </TeamDialog>
            ) : selected ? (
                <DetailDialog selected={selected} feature={feature} busy={busy} />
            ) : null}
        </>
    )
}

export function PlatformProxiesPage() {
    const { state } = useAuth()
    if (state.status !== 'authenticated') return null
    if (!state.account.capabilities.includes('platform.proxies.manage')) return <Navigate replace to="/app/forbidden" />
    return <ProxiesContent key={state.account.membership.id} membershipId={state.account.membership.id} />
}
