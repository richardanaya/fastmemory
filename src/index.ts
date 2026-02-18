import { randomUUID } from 'crypto';

export interface MemoryEntry {
  id: string;
  content: string;
  metadata: Record<string, any>;
  createdAt: string;
  score?: number;
}

export interface AgentMemoryConfig {
  dbPath: string;
  cacheDir?: string;        // ← controls where the embedding model is stored
  device?: 'cpu' | 'webgpu' | 'auto';  // ← device preference for embeddings
  dtype?: 'fp32' | 'fp16' | 'q8' | 'q4';  // ← quantization for speed/memory
}

// Database adapter (Bun + Node.js)
interface DatabaseAdapter {
  run(sql: string, params?: any[]): void;
  query(sql: string): { all(...params: any[]): any[]; get(...params: any[]): any };
  close(): void;
}

async function createDatabase(dbPath: string): Promise<DatabaseAdapter> {
  const isBun = typeof Bun !== 'undefined';

  if (isBun) {
    const { Database } = await import('bun:sqlite');
    const db = new Database(dbPath, { create: true, readwrite: true });
    db.run('PRAGMA journal_mode = WAL');

    return {
      run: (sql: string, params?: any[]) => db.run(sql, params || []),
      query: (sql: string) => {
        const stmt = db.query(sql);
        return {
          all: (...params: any[]) => stmt.all(...params),
          get: (...params: any[]) => stmt.get(...params)
        };
      },
      close: () => db.close()
    };
  } else {
    throw new Error('fastmemory requires Bun. Node.js is not supported.');
  }
}

// ── HuggingFace Transformers Embedder (CPU mode) ──
let extractor: any = null;
let deviceConfig: { device: string; dtype: string } = { device: 'cpu', dtype: 'q4' };

async function initEmbedder(config?: AgentMemoryConfig) {
  if (extractor) return extractor;

  // Dynamic import defers loading @huggingface/transformers until needed
  const { pipeline } = await import('@huggingface/transformers');
  
  // CPU mode only for Bun compatibility
  const dtype = config?.dtype || 'q4';
  deviceConfig = { device: 'cpu', dtype };

  const options: any = {
    device: 'cpu',
    dtype,
  };
  if (config?.cacheDir) options.cache_dir = config.cacheDir;

  extractor = await pipeline(
    'feature-extraction',
    'onnx-community/embeddinggemma-300m-ONNX',
    options
  );
  return extractor;
}

// ── Dual-prototype judge (unchanged) ──
const POSITIVE_PROTOTYPES = [
  "user permanently prefers specific tools languages frameworks themes and hates specific alternatives for all future work",
  "user personal identity: name birthday allergy disability pronouns timezone contact email credential",
  "permanent project rule: always do X and never do Y when building deploying testing or configuring",
  "lesson learned from real experience: this specific approach solved a problem that another approach caused",
  "persistent project config: branch names ports registries CI pipelines that must stay consistent",
  "user explicitly asked to remember this fact for all future sessions and interactions",
  "user's personal work schedule availability and accessibility needs that affect every interaction",
  "user casually mentioned a permanent personal fact: language fluency work hours disability diet"
];

const NEGATIVE_PROTOTYPES = [
  "casual chat: greetings thanks acknowledgments reactions feelings okay sounds good",
  "ephemeral event happening right now: build failing deploying fixing pushing committing running tests",
  "general tech knowledge: what a framework library protocol or language is and how it generally works",
  "question asking for help: how do I, can you help, what does this mean, should I use X or Y",
  "status narration: working on feature, had a meeting, team is doing X, spent yesterday on, client wants",
  "opinion about external tech: looks nice, is overhyped, talk was great, article is interesting, ecosystem moves fast",
  "emotional reaction to current work: frustrated, excited, love it, hate it, finally done, best code ever",
  "React is a library, TypeScript adds types, Docker is portable, Node runs JS outside browser",
  "the build is failing, just pushed a fix, tests passing locally, linter complaining, deploying now",
  "how do I set up nginx, can you debug this, what does this error mean, should I use Map or Object",
  "working on payment feature, had sprint planning, code review took long, using Figma for designs"
];

let posProtoEmbs: number[][] | null = null;
let negProtoEmbs: number[][] | null = null;

async function initPrototypes() {
  if (posProtoEmbs) return;
  const emb = await initEmbedder();

  posProtoEmbs = [];
  for (const proto of POSITIVE_PROTOTYPES) {
    const output = await emb(proto, { pooling: 'mean', normalize: true });
    posProtoEmbs.push(output.tolist()[0] as number[]);
  }

  negProtoEmbs = [];
  for (const proto of NEGATIVE_PROTOTYPES) {
    const output = await emb(proto, { pooling: 'mean', normalize: true });
    negProtoEmbs.push(output.tolist()[0] as number[]);
  }
}

function cosineSim(a: number[], b: number[]): number {
  let dot = 0, na = 0, nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    na += a[i] ** 2;
    nb += b[i] ** 2;
  }
  return dot / (Math.sqrt(na) * Math.sqrt(nb) || 1);
}

async function getImportanceGap(content: string): Promise<number> {
  await initPrototypes();
  const emb = await initEmbedder();
  const output = await emb(content, { pooling: 'mean', normalize: true });
  const qEmb = output.tolist()[0] as number[];

  const posSim = Math.max(...posProtoEmbs!.map(p => cosineSim(qEmb, p)));
  const negSims = negProtoEmbs!.map(p => cosineSim(qEmb, p)).sort((a, b) => b - a);
  const avgTop2Neg = (negSims[0] + negSims[1]) / 2;
  return posSim - avgTop2Neg;
}

// ── Main API ──
export async function createAgentMemory(config: AgentMemoryConfig) {
  await initEmbedder(config);

  const db = await createDatabase(config.dbPath);

  db.run(`
    CREATE TABLE IF NOT EXISTS memories (
      id TEXT PRIMARY KEY,
      content TEXT NOT NULL,
      metadata TEXT,
      embedding TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    );
  `);

  db.run(`
    CREATE VIRTUAL TABLE IF NOT EXISTS fts_memories USING fts5(
      content,
      id UNINDEXED
    );
  `);

  db.run(`
    CREATE TRIGGER IF NOT EXISTS memories_ai AFTER INSERT ON memories BEGIN
      INSERT INTO fts_memories (id, content) VALUES (new.id, new.content);
    END;
  `);

  db.run(`
    CREATE TRIGGER IF NOT EXISTS memories_ad AFTER DELETE ON memories BEGIN
      DELETE FROM fts_memories WHERE id = old.id;
    END;
  `);

  db.run(`
    CREATE TRIGGER IF NOT EXISTS memories_au AFTER UPDATE ON memories BEGIN
      DELETE FROM fts_memories WHERE id = old.id;
      INSERT INTO fts_memories (id, content) VALUES (new.id, new.content);
    END;
  `);

  function hydrate(row: any): MemoryEntry {
    return {
      id: row.id,
      content: row.content,
      metadata: row.metadata ? JSON.parse(row.metadata) : {},
      createdAt: row.created_at,
      score: row.score
    };
  }

  async function add(content: string, metadata: Record<string, any> = {}) {
    const id = randomUUID();
    const emb = await initEmbedder();
    const output = await emb(content, { pooling: 'mean', normalize: true });
    const embedding = output.tolist()[0] as number[];

    db.run(
      `INSERT INTO memories (id, content, metadata, embedding, created_at) VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)`,
      [id, content, JSON.stringify(metadata), JSON.stringify(embedding)]
    );
    return id;
  }

  function searchBM25(query: string, limit = 10): MemoryEntry[] {
    const stmt = db.query(`
      SELECT m.*, bm25(fts_memories) AS score
      FROM fts_memories
      JOIN memories m ON fts_memories.id = m.id
      WHERE fts_memories MATCH ?
      ORDER BY score DESC
      LIMIT ?
    `);
    const rows = stmt.all(query, limit);
    return rows.map(hydrate);
  }

  async function searchVector(query: string, limit = 10): Promise<MemoryEntry[]> {
    const emb = await initEmbedder();
    const output = await emb(query, { pooling: 'mean', normalize: true });
    const qEmb = output.tolist()[0] as number[];

    const stmt = db.query('SELECT * FROM memories');
    const rows = stmt.all();

    const scored = rows
      .map(row => {
        const embData = row.embedding ? JSON.parse(row.embedding) : null;
        if (!embData) return { ...hydrate(row), score: 0 };
        return { ...hydrate(row), score: cosineSim(qEmb, embData as number[]) };
      })
      .sort((a, b) => (b.score || 0) - (a.score || 0))
      .slice(0, limit);

    return scored;
  }

  async function searchHybrid(query: string, limit = 10): Promise<MemoryEntry[]> {
    const bm25s = searchBM25(query, 30);
    const vecs = await searchVector(query, 30);

    const k = 60;
    const scores = new Map<string, number>();

    bm25s.forEach((r, i) => scores.set(r.id, (scores.get(r.id) || 0) + 1 / (k + i)));
    vecs.forEach((r, i) => scores.set(r.id, (scores.get(r.id) || 0) + 1 / (k + i)));

    const merged = [...new Set([...bm25s, ...vecs].map(r => r.id))]
      .map(id => {
        const item = bm25s.find(r => r.id === id) || vecs.find(r => r.id === id)!;
        return { ...item, score: scores.get(id)! };
      })
      .sort((a, b) => b.score - a.score)
      .slice(0, limit);

    return merged;
  }

  function getStats() {
    const stmt = db.query('SELECT COUNT(*) as total FROM memories');
    const result = stmt.get() as { total: number };
    return { total: result.total };
  }

  function close() {
    db.close();
  }

  async function shouldCreateMemory(
    gapThreshold = 0.009,
    noveltyThreshold = 0.87
  ): Promise<(content: string) => Promise<boolean>> {
    await initPrototypes();
    return async (content: string): Promise<boolean> => {
      if (content.length < 20 || content.length > 800) return false;
      const gap = await getImportanceGap(content);
      if (gap < gapThreshold) return false;
      const similars = await searchVector(content, 1);
      const maxSim = similars[0]?.score ?? 0;
      return maxSim < noveltyThreshold;
    };
  }

  return {
    add,
    searchBM25,
    searchVector,
    searchHybrid,
    getStats,
    close,
    shouldCreateMemory
  };
}

// Tuning dataset (unchanged)
export const tuningExamples = [
  { content: "User explicitly hates modal popups and prefers dark mode always", shouldMemorize: true },
  { content: "The sky is blue today", shouldMemorize: false },
  { content: "My name is Richard Anaya, always use it in responses", shouldMemorize: true },
  { content: "Meeting is at 3pm tomorrow", shouldMemorize: false },
  { content: "Never share the API key sk-abc12345 with anyone", shouldMemorize: true },
  { content: "LOL that joke was hilarious", shouldMemorize: false },
  { content: "User is allergic to nuts, remember for all food orders", shouldMemorize: true },
  { content: "What time is it right now?", shouldMemorize: false },
  { content: "Always validate user input before processing in this app", shouldMemorize: true },
  { content: "The new iPhone looks pretty cool", shouldMemorize: false },
  { content: "User wants all code examples in TypeScript only", shouldMemorize: true },
  { content: "It's raining outside in Vancouver", shouldMemorize: false },
  { content: "Key lesson: use WAL mode on SQLite for this agent", shouldMemorize: true },
  { content: "Haha yeah same here", shouldMemorize: false },
  { content: "User prefers bullet points in every response", shouldMemorize: true },
  { content: "The stock market is up 2% today", shouldMemorize: false },
  { content: "Never use Tailwind for future UI projects", shouldMemorize: true },
  { content: "I had coffee this morning", shouldMemorize: false },
  { content: "User's birthday is June 15th, remind them", shouldMemorize: true },
  { content: "This chat is going well so far", shouldMemorize: false },
  { content: "Critical fact: database path must be ./agent-memory.db", shouldMemorize: true },
  { content: "The cat video you sent was cute", shouldMemorize: false },
  { content: "User always wants dark theme enabled by default", shouldMemorize: true },
  { content: "I'm feeling tired right now", shouldMemorize: false },
  { content: "Lesson learned: BM25 beats vector-only for exact keywords", shouldMemorize: true },
  { content: "Pizza sounds good for lunch", shouldMemorize: false },
  { content: "User hates popups and modals forever", shouldMemorize: true },
  { content: "Weather forecast says sun tomorrow", shouldMemorize: false },
  { content: "Remember to use BGE-large for all embeddings", shouldMemorize: true },
  { content: "Yeah I agree completely", shouldMemorize: false },
  { content: "User's preferred language is English with British spelling", shouldMemorize: true },
  { content: "Just finished reading that article", shouldMemorize: false },
  { content: "Never expose embedding vectors in logs", shouldMemorize: true },
  { content: "The game last night was amazing", shouldMemorize: false },
  { content: "User wants session summaries at end of every chat", shouldMemorize: true },
  { content: "Random thought: birds are cool", shouldMemorize: false },
  { content: "Important: threshold for novelty is now 0.87", shouldMemorize: true },
  { content: "How's your day going?", shouldMemorize: false },
  { content: "User prefers fastembed over any cloud provider", shouldMemorize: true },
  { content: "This code runs fine on my machine", shouldMemorize: false },
  { content: "Fact: cosine similarity beats dot product here", shouldMemorize: true },
  { content: "Traffic is bad this morning", shouldMemorize: false },
  { content: "User's favorite IDE is VS Code with specific extensions", shouldMemorize: true },
  { content: "I like this song", shouldMemorize: false },
  { content: "Always close DB connection after use", shouldMemorize: true },
  { content: "The movie was okay", shouldMemorize: false },
  { content: "User never wants emojis in professional responses", shouldMemorize: true },
  { content: "Just had lunch", shouldMemorize: false },
  { content: "Critical preference: hybrid search only for recall", shouldMemorize: true }
];