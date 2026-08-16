export function deriveResultsKey(uploadKey: string): string {
    return uploadKey.replace('/uploads/', '/results/')
}
