import {NetworkInterfaceInfo, networkInterfaces} from "node:os";
import {RoundRobin} from "./round-robin";

function getInterfaces(): NetworkInterfaceInfo[] {
    return Object.values(networkInterfaces())
        .filter(value => !!value).flat()
        .filter(value => !value.internal)
}

class NetworkInterfacesRR extends RoundRobin<NetworkInterfaceInfo> {
    constructor() {
        super(getInterfaces());
    }
}

export default new NetworkInterfacesRR()
