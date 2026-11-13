import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '@fontsource-variable/inter/wght.css'
import { App } from './app/App'
import './styles/tokens.css'
import './styles/global.css'
import { DevSupport } from '@react-buddy/ide-toolbox'
import { ComponentPreviews, useInitial } from './dev'

const rootElement = document.getElementById('root')

if (!rootElement) {
    throw new Error('The application root element is missing.')
}

createRoot(rootElement).render(
    <StrictMode>
        <DevSupport ComponentPreviews={ComponentPreviews}
                    useInitialHook={useInitial}
        >
            <App />
        </DevSupport>
    </StrictMode>
)
