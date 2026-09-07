import { isInvitationEntry } from './features/invitations/invitation-bootstrap'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '@fontsource-variable/inter/wght.css'
import { App } from './app/App'
import './styles/tokens.css'
import './styles/global.css'

const rootElement = document.getElementById('root')

if (!rootElement) {
    throw new Error('The application root element is missing.')
}

// A one-time invitation cannot survive a synthetic development remount. All
// ordinary application routes retain StrictMode's development diagnostics.
createRoot(rootElement).render(
    isInvitationEntry ? (
        <App />
    ) : (
        <StrictMode>
            <App />
        </StrictMode>
    ),
)
