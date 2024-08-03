import {AddressInfo} from "node:net";
import {Address6} from "ip-address";

export interface Endpoint {
    host: string
    port: number
}

export function getDomainFromSubdomain(subdomain: string): string {
    return subdomain.split('.').slice(-2).join('.')
}

export function ipToArpa(address: AddressInfo): string {
    return address.family === 'IPv4' ? ipv4ToArpa(address.address) : ipv6ToArpa(address.address)
}

export function ipv4ToArpa(ipv4: string): string {
    return `${ipv4.split('.').reverse().join('.')}.in-addr.arpa`
}

export function ipv6ToArpa(ipv6: string): string {
    // Create an Address6 object
    const addr = new Address6(ipv6);

    // Get the fully expanded address without colons
    const fullHex = addr.canonicalForm().replace(/:/g, '');

    // Reverse the order of the digits
    const reversedDigits = fullHex.split('').reverse().join('');

    // Insert dots between each digit
    const dottedDigits = reversedDigits.split('').join('.');

    // Append the domain
    return `${dottedDigits}.ip6.arpa`;
}
