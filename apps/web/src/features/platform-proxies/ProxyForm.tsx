import { useId, useLayoutEffect, useRef, useState } from 'react'
import action from '../../shared/Action.module.css'
import form from '../../shared/Form.module.css'
import { proxyCopy as copy, protocolLabels } from './platform-proxies-copy'
import type { CreateProxy, ProxyRecord } from './platform-proxies-api'
import styles from './ProxyFleet.module.css'

const fields = [
    { name: 'host', label: 'Host', type: 'text', help: 'Proxy hostname or IP address.', initial: '' },
    {
        name: 'port',
        label: 'Port',
        type: 'number',
        help: 'Whole number from 1 to 65535.',
        min: 1,
        max: 65535,
        initial: 1080,
    },
    { name: 'weight', label: 'Weight', type: 'number', help: 'Whole number, 0 or greater.', min: 0, initial: 1 },
    {
        name: 'maxConcurrent',
        label: 'Maximum concurrent connections',
        type: 'number',
        help: 'Whole number, at least 1 connection.',
        min: 1,
        initial: 1,
    },
    {
        name: 'requestsPerMinute',
        label: 'Requests per minute',
        type: 'number',
        help: 'Whole number, at least 1 request per minute.',
        min: 1,
        initial: 10,
    },
] as const

export function ProxyForm({
    proxy,
    busy,
    submit,
    dismiss,
    dismissCredentials,
}: {
    proxy?: ProxyRecord
    busy: boolean
    submit: (body: Omit<CreateProxy, 'state'>) => void
    dismiss: () => void
    dismissCredentials: () => void
}) {
    const id = useId()
    const element = useRef<HTMLFormElement>(null)
    const [authentication, setAuthentication] = useState(false)
    const [confirming, setConfirming] = useState(false)
    const [passwordVisible, setPasswordVisible] = useState(false)
    const [invalid, setInvalid] = useState<string | null>(null)
    const confirmationCancel = useRef<HTMLButtonElement>(null)
    function input(name: string) {
        return element.current!.elements.namedItem(name) as HTMLInputElement
    }
    function clear() {
        for (const name of ['proxy-user', 'proxy-pass']) {
            const field = element.current?.elements.namedItem(name) as HTMLInputElement | null
            if (field) field.value = ''
        }
    }
    useLayoutEffect(() => {
        const node = element.current!
        return () => {
            node.reset()
            node.querySelectorAll<HTMLInputElement>('input').forEach(field => {
                field.value = ''
            })
        }
    }, [])
    useLayoutEffect(() => {
        if (confirming) confirmationCancel.current?.focus()
    }, [confirming])
    function validate() {
        const bad = fields.find(field => !input(field.name).validity.valid || !input(field.name).value.trim())?.name
        const missingAuth = authentication && (!input('proxy-user').value || !input('proxy-pass').value)
        const name = bad ?? (missingAuth ? (!input('proxy-user').value ? 'proxy-user' : 'proxy-pass') : null)
        setInvalid(name)
        if (name) input(name).focus()
        return !name
    }
    function dispatch() {
        if (busy || !validate()) return
        const body: Omit<CreateProxy, 'state'> = {
            protocol: Number(input('protocol').value) as ProxyRecord['protocol'],
            host: input('host').value.trim(),
            port: Number(input('port').value),
            weight: Number(input('weight').value),
            maxConcurrent: Number(input('maxConcurrent').value),
            requestsPerMinute: Number(input('requestsPerMinute').value),
            description: input('description').value,
            ...(authentication ? { auth: { user: input('proxy-user').value, pass: input('proxy-pass').value } } : {}),
        }
        submit(body)
        clear()
        setAuthentication(false)
        setPasswordVisible(false)
        setConfirming(false)
    }
    return (
        <form
            ref={element}
            className={styles.form}
            noValidate
            autoComplete="off"
            onSubmit={event => {
                event.preventDefault()
                if (busy || !validate()) return
                if (proxy && authentication) setConfirming(true)
                else dispatch()
            }}
        >
            <fieldset className={styles.fields} disabled={busy || confirming}>
                <div className={form.field}>
                    <label className={form.label} htmlFor={`${id}-protocol`}>
                        Protocol
                    </label>
                    <select
                        id={`${id}-protocol`}
                        name="protocol"
                        className={form.control}
                        defaultValue={proxy?.protocol ?? 3}
                    >
                        {Object.entries(protocolLabels).map(([value, label]) => (
                            <option key={value} value={value}>
                                {label}
                            </option>
                        ))}
                    </select>
                </div>
                {fields.map(field => (
                    <div className={form.field} key={field.name}>
                        <label className={form.label} htmlFor={`${id}-${field.name}`}>
                            {field.label}
                        </label>
                        <input
                            id={`${id}-${field.name}`}
                            name={field.name}
                            type={field.type}
                            className={form.control}
                            autoComplete="off"
                            required
                            min={'min' in field ? field.min : undefined}
                            max={'max' in field ? field.max : undefined}
                            step={field.type === 'number' ? 1 : undefined}
                            defaultValue={proxy?.[field.name] ?? field.initial}
                            aria-invalid={invalid === field.name}
                            aria-describedby={`${id}-${field.name}-help${invalid === field.name ? ` ${id}-${field.name}-error` : ''}`}
                        />
                        <p id={`${id}-${field.name}-help`} className={form.help}>
                            {field.help}
                        </p>
                        {invalid === field.name ? (
                            <p id={`${id}-${field.name}-error`} className={form.error}>
                                {copy.fieldInvalid}
                            </p>
                        ) : null}
                    </div>
                ))}
                <div className={form.field}>
                    <label className={form.label} htmlFor={`${id}-description`}>
                        Description
                    </label>
                    <input
                        id={`${id}-description`}
                        name="description"
                        className={form.control}
                        autoComplete="off"
                        defaultValue={proxy?.description ?? ''}
                    />
                </div>
            </fieldset>
            {!proxy ? (
                <p>
                    Initial state: <strong>disabled</strong>. {copy.createDescription}
                </p>
            ) : null}
            <label className={styles.authentication}>
                <input
                    type="checkbox"
                    checked={authentication}
                    disabled={busy || confirming}
                    onChange={event => {
                        clear()
                        setAuthentication(event.target.checked)
                        setPasswordVisible(false)
                        setInvalid(null)
                        if (!event.target.checked) dismissCredentials()
                    }}
                />
                {proxy ? copy.replace : copy.useAuth}
            </label>
            {authentication ? (
                <fieldset className={styles.fields} disabled={busy || confirming}>
                    <legend>{proxy ? copy.replace : copy.useAuth}</legend>
                    <p className={styles.fullWidth}>{copy.authHelp}</p>
                    {(['proxy-user', 'proxy-pass'] as const).map(name => (
                        <div className={form.field} key={name}>
                            <label className={form.label} htmlFor={`${id}-${name}`}>
                                {name === 'proxy-user' ? copy.username : copy.password}
                            </label>
                            <input
                                id={`${id}-${name}`}
                                name={name}
                                type={name === 'proxy-pass' && !passwordVisible ? 'password' : 'text'}
                                className={form.control}
                                autoComplete={name === 'proxy-pass' ? 'new-password' : 'off'}
                                spellCheck={false}
                                required
                                aria-invalid={invalid === name}
                                aria-describedby={invalid === name ? `${id}-${name}-error` : undefined}
                            />
                            {name === 'proxy-pass' ? (
                                <button
                                    type="button"
                                    className={`${action.action} ${action.secondary}`}
                                    disabled={busy || confirming}
                                    aria-pressed={passwordVisible}
                                    onClick={() => setPasswordVisible(value => !value)}
                                >
                                    {passwordVisible ? 'Hide proxy password' : 'Show proxy password'}
                                </button>
                            ) : null}
                            {invalid === name ? (
                                <p id={`${id}-${name}-error`} className={form.error}>
                                    {copy.pairInvalid}
                                </p>
                            ) : null}
                        </div>
                    ))}
                </fieldset>
            ) : null}
            {confirming ? (
                <section aria-labelledby={`${id}-confirm`}>
                    <h3 id={`${id}-confirm`}>Replace authentication?</h3>
                    <p>
                        {proxy?.host}:{proxy?.port}. {copy.replaceDescription}
                    </p>
                    <div className={form.actions}>
                        <button
                            ref={confirmationCancel}
                            type="button"
                            className={`${action.action} ${action.secondary}`}
                            onClick={() => {
                                clear()
                                setAuthentication(false)
                                setConfirming(false)
                                dismissCredentials()
                            }}
                        >
                            Cancel replacement
                        </button>
                        <button type="button" className={action.action} disabled={busy} onClick={dispatch}>
                            {copy.replace}
                        </button>
                    </div>
                </section>
            ) : (
                <div className={form.actions}>
                    <button type="button" className={`${action.action} ${action.secondary}`} onClick={dismiss}>
                        {busy ? copy.cancelWaiting : copy.cancel}
                    </button>
                    <button type="submit" className={action.action} disabled={busy}>
                        {proxy ? copy.save : copy.create}
                    </button>
                </div>
            )}
        </form>
    )
}
