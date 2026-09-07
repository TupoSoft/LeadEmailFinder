import { useAuth } from '../features/auth/use-auth'
import { authCopy, capabilityLabels } from '../content/auth-shell'
import { StateMessage } from '../shared/StateMessage'
import action from '../shared/Action.module.css'
import styles from './WorkspaceHome.module.css'

export function WorkspaceHome() {
    const { state, bootstrap } = useAuth()
    if (state.status !== 'authenticated') return null
    const { account } = state

    return (
        <>
            <StateMessage title={authCopy.homeTitle} description={authCopy.homeDescription}>
                <button
                    type="button"
                    className={`${action.action} ${action.secondary}`}
                    onClick={() => void bootstrap()}
                >
                    {authCopy.refreshAccount}
                </button>
            </StateMessage>
            <section className={styles.account} aria-label={authCopy.account}>
                <dl>
                    <div>
                        <dt>{authCopy.account}</dt>
                        <dd>{account.email ?? authCopy.emailUnavailable}</dd>
                    </div>
                    <div>
                        <dt>{authCopy.organization}</dt>
                        <dd>{account.organization.name}</dd>
                    </div>
                </dl>
            </section>
            <section className={styles.access} aria-labelledby="access-heading">
                <h2 id="access-heading">{authCopy.access}</h2>
                <p>{authCopy.accessDescription}</p>
                {account.capabilities.length ? (
                    <ul>
                        {account.capabilities.map(capability => (
                            <li key={capability}>{capabilityLabels[capability]}</li>
                        ))}
                    </ul>
                ) : (
                    <p>{authCopy.noAccess}</p>
                )}
            </section>
        </>
    )
}
