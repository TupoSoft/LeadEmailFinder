import {NetworkInterfaceInfo, networkInterfaces} from "node:os";

import {RoundRobin} from "./RoundRobin";

function getInterfaces(): NetworkInterfaceInfo[] {
    return Object.values(networkInterfaces())
        .filter(value => !!value).flat()
        .filter(value => !value.internal)
}

export default new class extends RoundRobin<NetworkInterfaceInfo> {
    constructor() {
        super(getInterfaces());
    }
}
