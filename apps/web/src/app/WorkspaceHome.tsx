import { useAuth } from '../features/auth/use-auth'
import { authCopy, personalTools } from '../content/auth-shell'
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
                        <dd>{account.user.email}</dd>
                    </div>
                    <div>
                        <dt>{authCopy.name}</dt>
                        <dd>{account.user.name}</dd>
                    </div>
                </dl>
            </section>
            <section className={styles.access} aria-labelledby="access-heading">
                <h2 id="access-heading">{authCopy.access}</h2>
                <p>{authCopy.accessDescription}</p>
                <ul>
                    {personalTools.map(tool => (
                        <li key={tool}>{tool}</li>
                    ))}
                </ul>
            </section>
        </>
    )
}
