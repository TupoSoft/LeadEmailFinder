import {AddressInfo, Socket, SocketConstructorOpts, TcpSocketConnectOpts} from "net"
import {SocketReadyState} from "node:net";
import {ProxyData} from "./proxy";

interface PromisifiedSocketConnectOpts extends TcpSocketConnectOpts {
    proxy?: ProxyData
}

export class PromisifiedSocket {
    private readonly client: Socket;
    private addressInfo?: AddressInfo

    constructor(options?: SocketConstructorOpts) {
        this.client = new Socket(options);
        this.client.on('lookup', (err, address, family, host) => {
            if (!err) {
                console.debug(`The address have been looked up: ${address}, family: ${family}, host: ${host}`)
            } else {
                console.debug(`The error occurred during the address lookup: ${err}, address: ${address}, family: ${family}, host: ${host}`)
            }
        })
    }

    connect(options: PromisifiedSocketConnectOpts): Promise<this> {
        return new Promise(async (resolve, reject) => {
            const {proxy, host: targetHost, port: targetPort} = options

            const errorListener = (err: Error) => {
                console.debug('Connection error:', err)
                this.client.removeListener('connect', proxyConnectionListener)
                reject(err)
            }

            const connectionListener = () => {
                console.debug(`Connected to server at ${options.host}:${options.port}`);

                this.addressInfo = this.client.address() as AddressInfo

                resolve(this);
            }

            const proxyConnectionListener = async () => {
                const {host: proxyHost, port: proxyPort, user, password} = proxy!

                console.debug(`Connection to proxy ${proxyHost}:${proxyPort} established successfully`)

                this.addressInfo = {
                    address: proxyHost,
                    port: proxyPort,
                    family: this.client.remoteFamily!
                }

                const connectRequest = `CONNECT ${targetHost}:${targetPort} HTTP/1.1\r\n` +
                    `Host: ${targetHost}:${targetPort}\r\n` +
                    (user && password ? `Proxy-Authorization: Basic ${this.generateProxyAuthToken(user, password)}\r\n` : ``) +
                    `\r\n`

                try {
                    await this.write(connectRequest)
                    const response = await this.read()
                    if (response.includes('HTTP/1.1 200 Connection established')) {
                        console.debug(`Connection to target server ${targetHost}:${targetPort} established successfully.`);
                        this.client.removeListener('error', errorListener)
                        resolve(this)
                    } else {
                        this.end()
                        reject(`Failed to establish connection: ${response}`)
                    }
                } catch (error) {
                    reject(error)
                }
            }

            const connectionHandler = proxy ? proxyConnectionListener : connectionListener

            if (proxy) {
                options.host = proxy.host
                options.port = proxy.port
            }

            this.client.connect(options, connectionHandler).once('error', errorListener)
        });
    }

    write(message: string): Promise<void> {
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
        return new Promise((resolve, reject) => {
            const onError = (error: Error) => {
                reject(error);
            }

            const onData = (data: Buffer) => {
                const read = data.toString();
                console.debug(`Read: ${read}`)
                this.client.removeListener('error', onError)
                resolve(read);
            }

            this.client.once('data', onData).once('error', onError);
        });
    }

    end(): void {
        this.client.end();
        console.debug('Disconnected from server');
    }

    getAddressInfo(): AddressInfo | undefined {
        return this.addressInfo
    }

    getReadyState(): SocketReadyState {
        return this.client.readyState
    }

    private generateProxyAuthToken(user: string, password: string): string {
        return Buffer.from(`${user}:${password}`).toString('base64')
    }
}
