import {NetworkInterfaceInfo, networkInterfaces} from "node:os"
import {reverse} from "node:dns/promises"

import {RoundRobin} from "./RoundRobin";

interface NetworkInterface {
    address: string,
    family: number,
    pointerRecord: string,
}

function getInterfaces(): NetworkInterfaceInfo[] {
    return Object.values(networkInterfaces())
        .filter(value => !!value).flat()
        .filter(value => !value.internal)
        .filter(value => value.scopeid ? value.scopeid == 0x0 : value)
}

class NetworkInterfaceInfoRoundRobin extends RoundRobin<NetworkInterface> {
    constructor() {
        super();
    }
}

const instance = new NetworkInterfaceInfoRoundRobin();

(async (): Promise<void> => {
    const interfaces = getInterfaces().map(async value => {
        const nif: NetworkInterface = {
            address: value.address,
            family: value.family === "IPv6" ? 6 : 4,
            pointerRecord: ""
        }

        try {
            const ptr = await reverse(value.address)
            nif.pointerRecord = ptr[0]
        } catch (error) {
        }

        return nif
    });

    const result = await Promise.all(interfaces)
    const interfacesWithPTR = result.filter(value => value.pointerRecord !== "")
    instance.addItems(interfacesWithPTR)
})();

export default instance
