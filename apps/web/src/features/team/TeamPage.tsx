import { useEffect, useId, useRef, useState, type FormEvent } from 'react'
import { useLocation, useSearchParams } from 'react-router-dom'
import { useDocumentTitle } from '../../app/useDocumentTitle'
import type { CurrentAccount } from '../../api/current-account'
import { useAuth } from '../auth/use-auth'
import { useBrowserAvailability } from '../billing/use-billing'
import { ProductPanel } from '../../shared/ProductPanel'
import action from '../../shared/Action.module.css'
import form from '../../shared/Form.module.css'
import { TeamDialog } from './TeamDialog'
import { teamCopy } from './team-copy'
import type { InviteRequest, TeamMember, TeamRole } from './team-api'
import { useTeam } from './use-team'
import styles from './TeamView.module.css'

type Confirmation =
    | { kind: 'role'; member: TeamMember; role: TeamRole }
    | { kind: 'remove'; member: TeamMember }
    | { kind: 'invite'; body: InviteRequest }

function RoleOptions({ owner }: { owner: boolean }) {
    return (
        <>
            {(['member', 'admin', ...(owner ? ['owner'] : [])] as TeamRole[]).map(role => (
                <option key={role} value={role}>
                    {teamCopy.roles[role]}
                </option>
            ))}
        </>
    )
}

function InviteForm({
    owner,
    busy,
    issuing,
    onInvite,
    onCancel,
}: {
    owner: boolean
    busy: boolean
    issuing: boolean
    onInvite: (body: InviteRequest) => void
    onCancel: () => void
}) {
    const emailInput = useRef<HTMLInputElement>(null)
    const id = useId()
    const [email, setEmail] = useState('')
    const [role, setRole] = useState<TeamRole>('member')
    const [invalid, setInvalid] = useState(false)
    function submit(event: FormEvent<HTMLFormElement>) {
        event.preventDefault()
        if (busy) return
        if (!email.trim() || !emailInput.current?.validity.valid) {
            setInvalid(true)
            emailInput.current?.focus()
            return
        }
        setInvalid(false)
        onInvite({ email: email.trim(), role })
    }
    return (
        <section className={styles.invitation} aria-labelledby={`${id}-heading`}>
            <h2 id={`${id}-heading`}>{teamCopy.invite}</h2>
            <p>{teamCopy.inviteDescription}</p>
            <form noValidate className={styles.inviteForm} onSubmit={submit} aria-busy={busy}>
                <div className={form.field}>
                    <label className={form.label} htmlFor={`${id}-email`}>
                        {teamCopy.email}
                    </label>
                    <input
                        ref={emailInput}
                        id={`${id}-email`}
                        className={form.control}
                        type="email"
                        required
                        value={email}
                        autoComplete="off"
                        disabled={busy}
                        maxLength={254}
                        aria-invalid={invalid}
                        aria-describedby={invalid ? `${id}-error` : undefined}
                        onChange={event => {
                            setEmail(event.target.value)
                            setInvalid(false)
                        }}
                    />
                    {invalid ? (
                        <p className={form.error} id={`${id}-error`}>
                            {teamCopy.emailError}
                        </p>
                    ) : null}
                </div>
                <div className={form.field}>
                    <label className={form.label} htmlFor={`${id}-role`}>
                        {teamCopy.role}
                    </label>
                    <select
                        id={`${id}-role`}
                        className={form.control}
                        value={role}
                        disabled={busy}
                        onChange={event => setRole(event.target.value as TeamRole)}
                    >
                        <RoleOptions owner={owner} />
                    </select>
                </div>
                <div className={`${form.actions} ${styles.inviteActions}`}>
                    <button className={action.action} disabled={busy} type="submit">
                        {teamCopy.inviteAction}
                    </button>
                    {issuing ? (
                        <button type="button" className={`${action.action} ${action.secondary}`} onClick={onCancel}>
                            {teamCopy.cancel}
                        </button>
                    ) : null}
                </div>
            </form>
        </section>
    )
}

function MemberRow({
    member,
    owner,
    canManage,
    busy,
    onChange,
    onRemove,
}: {
    member: TeamMember
    owner: boolean
    canManage: boolean
    busy: boolean
    onChange: (member: TeamMember, role: TeamRole) => void
    onRemove: (member: TeamMember) => void
}) {
    const [draft, setDraft] = useState<{ source: TeamRole; value: TeamRole } | null>(null)
    const role = draft?.source === member.role ? draft.value : member.role
    const email = member.email ?? teamCopy.unavailableEmail
    const canEdit = canManage && member.status === 'active' && (member.role !== 'owner' || owner)
    const label = useId()
    return (
        <tr>
            <td>
                <span className={styles.mobileLabel} aria-hidden="true">
                    {teamCopy.email}
                </span>
                <strong className={styles.memberEmail}>{email}</strong>
            </td>
            <td>
                <span className={styles.mobileLabel} aria-hidden="true">
                    {teamCopy.role}
                </span>
                {canEdit ? (
                    <div className={styles.roleControl}>
                        <select
                            id={label}
                            className={form.control}
                            aria-label={`Role for ${email}`}
                            value={role}
                            disabled={busy}
                            onChange={event => setDraft({ source: member.role, value: event.target.value as TeamRole })}
                        >
                            <RoleOptions owner={owner} />
                        </select>
                        <button
                            type="button"
                            className={`${action.action} ${action.secondary}`}
                            disabled={busy || role === member.role}
                            aria-label={`Save role for ${email}`}
                            onClick={() => onChange(member, role)}
                        >
                            {teamCopy.saveRole}
                        </button>
                    </div>
                ) : (
                    <span>{teamCopy.roles[member.role]}</span>
                )}
            </td>
            <td>
                <span className={styles.mobileLabel} aria-hidden="true">
                    {teamCopy.status}
                </span>
                <span className={styles.status}>{teamCopy.statuses[member.status]}</span>
            </td>
            <td>
                <span className={styles.mobileLabel} aria-hidden="true">
                    {teamCopy.actions}
                </span>
                {canEdit ? (
                    <button
                        type="button"
                        className={`${action.action} ${action.secondary}`}
                        disabled={busy}
                        aria-label={`Disable access for ${email}`}
                        onClick={() => onRemove(member)}
                    >
                        {teamCopy.remove}
                    </button>
                ) : (
                    <span>
                        {member.status === 'disabled'
                            ? teamCopy.disabled
                            : !canManage
                              ? teamCopy.readOnly
                              : teamCopy.ownerOnly}
                    </span>
                )}
            </td>
        </tr>
    )
}

function MemberList({
    team,
    owner,
    canManage,
    busy,
    requestConfirmation,
}: {
    team: ReturnType<typeof useTeam>
    owner: boolean
    canManage: boolean
    busy: boolean
    requestConfirmation: (value: Confirmation) => void
}) {
    const [params, setParams] = useSearchParams()
    const members = team.members.data ?? []
    const lastPage = Math.max(1, Math.ceil(members.length / 10))
    const suppliedPage = Number(params.get('page') ?? 1)
    const page = Number.isSafeInteger(suppliedPage) && suppliedPage > 0 ? Math.min(suppliedPage, lastPage) : 1
    const start = (page - 1) * 10
    function goToPage(value: number) {
        const next = new URLSearchParams(params)
        if (value === 1) next.delete('page')
        else next.set('page', String(value))
        setParams(next)
    }
    return (
        <ProductPanel
            title={teamCopy.members}
            description={teamCopy.membersDescription}
            pending={team.members.isPending}
            refreshing={team.members.isFetching}
            failed={team.members.isError}
            retry={() => void team.members.refetch()}
            reserveContent
        >
            {team.members.data?.length === 0 ? <p>{teamCopy.empty}</p> : null}
            {members.length ? (
                <>
                    <table className={styles.table}>
                        <caption
                            className={styles.caption}
                        >{`Members ${start + 1}–${Math.min(start + 10, members.length)} of ${members.length}`}</caption>
                        <thead>
                            <tr>
                                {[teamCopy.email, teamCopy.role, teamCopy.status, teamCopy.actions].map(text => (
                                    <th key={text} scope="col">
                                        {text}
                                    </th>
                                ))}
                            </tr>
                        </thead>
                        <tbody>
                            {members.slice(start, start + 10).map(member => (
                                <MemberRow
                                    key={member.id}
                                    member={member}
                                    owner={owner}
                                    canManage={canManage}
                                    busy={busy}
                                    onChange={(target, role) => {
                                        if (target.role === 'owner' || role === 'owner')
                                            requestConfirmation({ kind: 'role', member: target, role })
                                        else void team.changeRole(target.id, role)
                                    }}
                                    onRemove={target => requestConfirmation({ kind: 'remove', member: target })}
                                />
                            ))}
                        </tbody>
                    </table>
                    {lastPage > 1 ? (
                        <nav className={styles.pagination} aria-label="Member pages">
                            <button
                                type="button"
                                className={`${action.action} ${action.secondary}`}
                                disabled={page === 1 || busy}
                                onClick={() => goToPage(page - 1)}
                            >
                                Previous members
                            </button>
                            <button
                                type="button"
                                className={`${action.action} ${action.secondary}`}
                                disabled={page === lastPage || busy}
                                onClick={() => goToPage(page + 1)}
                            >
                                Next members
                            </button>
                        </nav>
                    ) : null}
                </>
            ) : null}
        </ProductPanel>
    )
}

function ConfirmDialog({
    value,
    onDismiss,
    onConfirm,
}: {
    value: Confirmation
    onDismiss: () => void
    onConfirm: () => void
}) {
    const email = value.kind === 'invite' ? value.body.email : (value.member.email ?? teamCopy.unavailableEmail)
    const description =
        value.kind === 'remove'
            ? `${email} will lose access to this organization. The disabled membership stays in the member list and cannot be reactivated.`
            : value.kind === 'invite'
              ? `Invite ${email} as an owner? ${teamCopy.ownerWarning}`
              : `Change ${email} from ${teamCopy.roles[value.member.role]} to ${teamCopy.roles[value.role]}? ${teamCopy.ownerWarning}`
    return (
        <TeamDialog
            title={
                value.kind === 'remove'
                    ? teamCopy.removalConfirmation
                    : value.kind === 'invite'
                      ? teamCopy.grantOwnerConfirmation
                      : teamCopy.ownerConfirmation
            }
            description={description}
            onDismiss={onDismiss}
        >
            <div className={form.actions}>
                <button
                    type="button"
                    data-initial-focus
                    className={`${action.action} ${action.secondary}`}
                    onClick={onDismiss}
                >
                    {teamCopy.cancel}
                </button>
                <button type="button" className={action.action} onClick={onConfirm}>
                    {value.kind === 'remove'
                        ? teamCopy.remove
                        : value.kind === 'invite'
                          ? teamCopy.inviteAction
                          : teamCopy.saveRole}
                </button>
            </div>
        </TeamDialog>
    )
}

function TeamContent({ account }: { account: CurrentAccount }) {
    useDocumentTitle(`${teamCopy.title} | Lead Email Finder`)
    const team = useTeam(account.organization.id)
    const { online } = useBrowserAvailability()
    const [confirmation, setConfirmation] = useState<Confirmation | null>(null)
    const owner = account.membership.role === 'owner'
    const canManage = account.capabilities.includes('team.manage')
    const busy = team.operation.pending !== null || !online
    const linkId = useId()
    const feedback = useRef<HTMLDivElement>(null)
    useEffect(() => {
        if (team.operation.notice === teamCopy.removed || team.operation.notice === teamCopy.roleSaved)
            feedback.current?.focus()
    }, [team.operation.notice])
    function submitConfirmation() {
        if (!confirmation) return
        if (confirmation.kind === 'invite') void team.invite(confirmation.body)
        else if (confirmation.kind === 'role') void team.changeRole(confirmation.member.id, confirmation.role)
        else void team.remove(confirmation.member.id)
        setConfirmation(null)
    }
    return (
        <>
            <header className={styles.header}>
                <h1>{teamCopy.title}</h1>
                <p>{teamCopy.description}</p>
                <p>{teamCopy.hierarchy}</p>
            </header>
            {!online ? <p role="status">{teamCopy.offline}</p> : null}
            {canManage ? (
                <InviteForm
                    owner={owner}
                    busy={busy}
                    issuing={team.operation.pending === 'invitation'}
                    onCancel={team.dismiss}
                    onInvite={body => {
                        if (body.role === 'owner') setConfirmation({ kind: 'invite', body })
                        else void team.invite(body)
                    }}
                />
            ) : (
                <p>{teamCopy.readOnly}</p>
            )}
            <div ref={feedback} tabIndex={-1} role="status" aria-live="polite" className={styles.feedback}>
                {team.operation.pending === 'invitation'
                    ? teamCopy.issuing
                    : team.operation.pending === 'member'
                      ? teamCopy.working
                      : team.operation.notice}
            </div>
            <button
                type="button"
                className={`${action.action} ${action.secondary}`}
                disabled={busy || team.members.isFetching}
                onClick={() => void team.members.refetch()}
            >
                {teamCopy.refresh}
            </button>
            <MemberList
                team={team}
                owner={owner}
                canManage={canManage}
                busy={busy || team.members.isFetching}
                requestConfirmation={setConfirmation}
            />
            {confirmation ? (
                <ConfirmDialog
                    value={confirmation}
                    onDismiss={() => setConfirmation(null)}
                    onConfirm={submitConfirmation}
                />
            ) : null}
            {team.operation.issuedUrl ? (
                <TeamDialog
                    title={teamCopy.invitationCreated}
                    description={teamCopy.invitationSecret}
                    onDismiss={team.dismiss}
                >
                    <div className={form.field}>
                        <label className={form.label} htmlFor={linkId}>
                            Invitation link
                        </label>
                        <input
                            id={linkId}
                            className={form.control}
                            readOnly
                            value={team.operation.issuedUrl}
                            autoComplete="off"
                            onCopy={event => {
                                event.preventDefault()
                                event.clipboardData.setData('text/plain', team.operation.issuedUrl ?? '')
                                team.copied()
                            }}
                        />
                    </div>
                    <p role="status" className={styles.feedback}>
                        {team.operation.notice}
                    </p>
                    <div className={`${form.actions} ${styles.dialogActions}`}>
                        <button type="button" className={`${action.action} ${action.secondary}`} onClick={team.dismiss}>
                            {teamCopy.close}
                        </button>
                        <button
                            type="button"
                            data-initial-focus
                            className={action.action}
                            disabled={team.operation.pending === 'copy'}
                            onClick={() => void team.copy()}
                        >
                            {teamCopy.copy}
                        </button>
                    </div>
                </TeamDialog>
            ) : null}
        </>
    )
}

export function TeamPage() {
    const { state } = useAuth()
    const location = useLocation()
    if (state.status !== 'authenticated') return null
    return <TeamContent key={`${state.account.membership.id}:${location.key}`} account={state.account} />
}
