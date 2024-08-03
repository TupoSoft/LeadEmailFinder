export class RoundRobin<T> {
    private readonly items: T[]
    private currentIndex: number

    constructor(items: T[] = []) {
        this.items = items
        this.currentIndex = 0
    }

    next(): T {
        if (this.currentIndex >= this.items.length) {
            this.currentIndex = 0
        }

        const item = this.items[this.currentIndex]
        this.currentIndex++
        return item
    }
}