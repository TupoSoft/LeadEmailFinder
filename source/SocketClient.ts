import net from "net"
import networkInterfaceInfoRoundRobin from "./NetworkInterfaceInfoRoundRobin";

export class SocketClient {
    private client: net.Socket;

    constructor() {
        this.client = new net.Socket();
    }

    connect(host: string, port: number): Promise<void> {
        return new Promise((resolve, reject) => {
            const nextInterface = networkInterfaceInfoRoundRobin.next()

            this.client.connect({
                port: port,
                host: host,
                localAddress: nextInterface.address,
                family: nextInterface.family,
            }, () => {
                console.debug(`Connected to server at ${host}:${port}`);
                resolve();
            });

            this.client.on('error', (err) => {
                console.debug('Connection error:', err);
                reject(err);
            });
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

    disconnect(): void {
        this.client.end();
        console.debug('Disconnected from server');
    }

    getAddressInfo(): net.AddressInfo {
        return this.client.address() as net.AddressInfo
    }
}
