export enum JobState {
    ACTIVE = 'active',
    DELAYED = 'delayed',
    PRIORITIZED = 'prioritized',
    WAITING = 'waiting',
    WAITING_CHILDREN = 'waiting-children',
    COMPLETED = 'completed',
    FAILED = 'failed',
    PAUSED = 'paused',
    UNKNOWN = 'unknown',
}
