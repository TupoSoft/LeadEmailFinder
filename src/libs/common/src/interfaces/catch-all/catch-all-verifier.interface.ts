export interface ICatchAllVerifier {
    sourceName: 'mx' | 'microsoft_4' | 'microsoft_1' | 'mimecast' | 'microsoft_2'
    verify: (email: string) => Promise<boolean>
}
