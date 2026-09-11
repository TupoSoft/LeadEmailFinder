import type { ReactNode } from 'react'
import action from '../../shared/Action.module.css'
import table from '../service-clients/ServiceClientsView.module.css'
import type { ProxyRecord } from './platform-proxies-api'
import { lifecycleCopy, protocolLabels, proxyCopy as copy, stateLabels } from './platform-proxies-copy'
import styles from './ProxyFleet.module.css'

export type ProxyAction = 'edit' | 'blacklist' | 'delete' | ProxyRecord['state']
function Cell({ label, children }: { label: string; children: ReactNode }) {
    return (
        <td>
            <span className={table.mobileLabel} aria-hidden="true">
                {label}
            </span>
            <div>{children}</div>
        </td>
    )
}
const formatter = new Intl.DateTimeFormat('en', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'UTC' })
function DateValue({ value }: { value: string }) {
    const date = new Date(value)
    return Number.isNaN(date.getTime()) ? (
        copy.dateUnavailable
    ) : (
        <time dateTime={value}>{formatter.format(date)} UTC</time>
    )
}
export function ProxyRegistry({
    proxies,
    busy,
    select,
}: {
    proxies: ProxyRecord[]
    busy: boolean
    select: (proxy: ProxyRecord, action: ProxyAction) => void
}) {
    return (
        <table className={table.table}>
            <caption className={table.caption}>{copy.registry}</caption>
            <thead>
                <tr>
                    {['Endpoint', 'Allocation', 'MX blacklists', 'Record', 'Actions'].map(label => (
                        <th key={label} scope="col">
                            {label}
                        </th>
                    ))}
                </tr>
            </thead>
            <tbody>
                {proxies.map(proxy => (
                    <tr key={proxy.id}>
                        <Cell label="Endpoint">
                            <strong>
                                {proxy.host}:{proxy.port}
                            </strong>
                            <p>{protocolLabels[proxy.protocol]}</p>
                            <p>{proxy.description || copy.noDescription}</p>
                        </Cell>
                        <Cell label="Allocation">
                            <dl className={styles.metadata}>
                                <div>
                                    <dt>State</dt>
                                    <dd>{stateLabels[proxy.state]}</dd>
                                </div>
                                <div>
                                    <dt>Weight</dt>
                                    <dd>{proxy.weight}</dd>
                                </div>
                                <div>
                                    <dt>Maximum concurrent connections</dt>
                                    <dd>{proxy.maxConcurrent}</dd>
                                </div>
                                <div>
                                    <dt>Requests per minute</dt>
                                    <dd>{proxy.requestsPerMinute}</dd>
                                </div>
                            </dl>
                        </Cell>
                        <Cell label="MX blacklists">
                            {proxy.blacklists.length ? (
                                <ul className={styles.blacklists}>
                                    {proxy.blacklists.map(host => (
                                        <li key={host}>{host}</li>
                                    ))}
                                </ul>
                            ) : (
                                copy.noBlacklists
                            )}
                        </Cell>
                        <Cell label="Record">
                            <dl className={styles.metadata}>
                                <div>
                                    <dt>ID</dt>
                                    <dd>{proxy.id}</dd>
                                </div>
                                <div>
                                    <dt>Created</dt>
                                    <dd>
                                        <DateValue value={proxy.createdAt} />
                                    </dd>
                                </div>
                                <div>
                                    <dt>Updated</dt>
                                    <dd>
                                        <DateValue value={proxy.updatedAt} />
                                    </dd>
                                </div>
                            </dl>
                        </Cell>
                        <Cell label="Actions">
                            <div className={styles.rowActions}>
                                <button
                                    type="button"
                                    className={`${action.action} ${action.secondary}`}
                                    disabled={busy}
                                    onClick={() => select(proxy, 'edit')}
                                >
                                    {copy.edit}
                                </button>
                                {(Object.keys(lifecycleCopy) as ProxyRecord['state'][])
                                    .filter(state => state !== proxy.state)
                                    .map(state => (
                                        <button
                                            key={state}
                                            type="button"
                                            className={`${action.action} ${action.secondary}`}
                                            disabled={busy}
                                            onClick={() => select(proxy, state)}
                                        >
                                            {lifecycleCopy[state].action}
                                        </button>
                                    ))}
                                <button
                                    type="button"
                                    className={`${action.action} ${action.secondary}`}
                                    disabled={busy}
                                    onClick={() => select(proxy, 'blacklist')}
                                >
                                    {copy.blacklist}
                                </button>
                                <button
                                    type="button"
                                    className={`${action.action} ${action.secondary}`}
                                    disabled={busy}
                                    onClick={() => select(proxy, 'delete')}
                                >
                                    {copy.delete}
                                </button>
                            </div>
                        </Cell>
                    </tr>
                ))}
            </tbody>
        </table>
    )
}
