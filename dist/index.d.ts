export interface MemoryEntry {
    id: string;
    content: string;
    metadata: Record<string, any>;
    createdAt: string;
    score?: number;
}
export interface AgentMemoryConfig {
    dbPath: string;
    cacheDir?: string;
    device?: 'cpu' | 'webgpu' | 'auto';
    dtype?: 'fp32' | 'fp16' | 'q8' | 'q4';
}
export declare function createAgentMemory(config: AgentMemoryConfig): Promise<{
    add: (content: string, metadata?: Record<string, any>) => Promise<`${string}-${string}-${string}-${string}-${string}`>;
    searchBM25: (query: string, limit?: number) => MemoryEntry[];
    searchVector: (query: string, limit?: number) => Promise<MemoryEntry[]>;
    searchHybrid: (query: string, limit?: number) => Promise<MemoryEntry[]>;
    getStats: () => {
        total: number;
    };
    close: () => void;
    shouldCreateMemory: (gapThreshold?: number, noveltyThreshold?: number) => Promise<(content: string) => Promise<boolean>>;
}>;
export declare const tuningExamples: {
    content: string;
    shouldMemorize: boolean;
}[];
//# sourceMappingURL=index.d.ts.map