import {AddressInfo, Socket, SocketConstructorOpts, TcpSocketConnectOpts} from "net"
import {SocketReadyState} from "node:net";
import {clearTimeout} from "node:timers";

export class PromisifiedSocket {
    private readonly client: Socket;
    private readonly idleTimeoutMillis: number
    private idleTimeout: NodeJS.Timeout | null = null

    constructor(options?: SocketConstructorOpts, idleTimeoutMillis: number = 60000) {
        this.client = new Socket(options);
        this.idleTimeoutMillis = idleTimeoutMillis
    }

    connect(options: TcpSocketConnectOpts): Promise<this> {
        return new Promise((resolve, reject) => {
            this.resetIdleTimeout()

            this.client.connect(options, () => {
                console.debug(`Connected to server at ${options.host}:${options.port}`);
                resolve(this);
            });

            this.client.on('error', (err) => {
                console.debug('Connection error:', err);
                reject(err);
            });
        });
    }

    write(message: string): Promise<void> {
        this.resetIdleTimeout()
        console.debug(`Write: ${message}`)

        return new Promise((resolve, reject) => {
            this.client.write(message, (err) => {
                if (err) {
                    reject(err);
                } else {
                    resolve();
                }
            });
        });
    }

    read(): Promise<string> {
        this.resetIdleTimeout()

        return new Promise((resolve, reject) => {
            this.client.once('data', (data) => {
                const read = data.toString();
                console.debug(`Read: ${read}`)
                resolve(read);
            });

            this.client.on('error', (err) => {
                reject(err);
            });
        });
    }

    end(): void {
        this.client.end();
        console.debug('Disconnected from server');
    }

    getAddressInfo(): AddressInfo {
        return this.client.address() as AddressInfo
    }

    getReadyState(): SocketReadyState {
        return this.client.readyState
    }

    private resetIdleTimeout() {
        if (this.idleTimeout) {
            clearTimeout(this.idleTimeout);
        }

        this.idleTimeout = setTimeout(() => {
            this.client.end()
            console.debug('Socket connection timed out due to inactivity')
        }, this.idleTimeoutMillis)
    }
}
