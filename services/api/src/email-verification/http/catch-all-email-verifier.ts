export interface CatchAllEmailVerifier {
    verify: (email: string) => Promise<boolean>
}
