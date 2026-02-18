# FastMemory

Zero-cost local semantic memory for AI agents. Hybrid search (BM25 + vector + fusion), importance detection, and deduplication -- all running 100% offline with Bun's native SQLite.

## The Problem

Every AI agent conversation generates thousands of messages. The vast majority are ephemeral:
- "thanks!"
- "the build is failing on CI"
- "let me check something real quick"
- "React is a library for building UIs" (general knowledge)

But buried in the noise are permanent, valuable facts:
- "I hate modals, always use dark mode"
- "My API key is sk-abc123, never share it"
- "Always validate user input before processing"

**The challenge:** How do we automatically distinguish "remember forever" from "ignore immediately"? And how do we do it without:
- Costly API calls to judge every message
- Complex LLM chains that add latency
- Cloud dependencies that break offline usage

## The Solution: Embeddings as Judge

We use a local embedding model (BGE-large, 1024 dimensions) that converts text into arrays of numbers. Similar sentences end up as similar arrays.

But here's the key innovation: **we don't just ask "is this memorable?" -- we ask "is this MORE memorable than throwaway?"**

### Dual-Prototype Approach

We maintain two sets of prototype sentences:

**Positive prototypes** (what memorable content looks like):
- Permanent preferences ("hates modals, prefers TypeScript")
- Personal facts (name, birthday, disabilities)
- Project rules ("always validate, never deploy Fridays")
- Lessons learned ("SQLite VACUUM locks the database")
- Persistent config (ports, registries, CI pipelines)

**Negative prototypes** (what junk looks like):
- Casual chat ("thanks!", "got it", "let me think")
- Ephemeral events ("build failing", "tests passing", "deploying now")
- General knowledge ("React is a library", "HTTP 404 means not found")
- Questions ("how do I set up nginx?")
- Status narration ("working on payment feature", "had sprint planning")
- Opinions ("Rust is overhyped", "that talk was great")

For each incoming sentence, we compute:
```
gap = max_similarity(positive) - avg(top_2_similarities(negative))
```

If `gap > threshold`, the sentence is closer to "memorable" than "throwaway" -- save it. Otherwise, ignore.

## Why Not a Micro LLM?

We considered using a tiny LLM (like Phi-3 or Gemma 2B) as the judge. Why didn't we?

1. **Latency:** Even small LLMs take 50-200ms per inference on CPU. Embeddings take <10ms after warmup.

2. **Resource usage:** Running an LLM constantly in the background consumes 2-4GB RAM. FastMemory uses ~1.2GB for the embedding model once, then operates in <100MB.

3. **Consistency:** LLMs can be flaky -- same prompt, different answers. Cosine similarity is deterministic.

4. **Cost:** Zero. No tokens, no API calls, no rate limits.

The tradeoff is accuracy. An LLM judge would likely hit 90-95% accuracy. FastMemory hits ~80%. For most agent use cases, 80% precision (only 20% noise) with zero ongoing cost is the right tradeoff.

## Research Findings

See [MEMORY_RESEARCH.md](./MEMORY_RESEARCH.md) for the full technical deep-dive.

**Key findings:**

1. **Single-sided prototypes fail:** Just scoring against "memorable" prototypes gives ~61% accuracy (random). The positive and negative distributions completely overlap in embedding space.

2. **Dual prototypes work:** The gap metric (pos - neg) eliminates the overlap problem, achieving 95.9% on curated examples and ~80% on diverse real-world content.

3. **~80% is the practical ceiling for embeddings:** The fundamental limitation is that embeddings measure *topical similarity*, not *intent to persist*. These look nearly identical to the embedding model:
   - "Always add error boundaries" (should memorize -- it's a rule)
   - "React is a library" (should skip -- it's general knowledge)

4. **Prototypes should be archetypal, not literal:** "permanent project rule: always do X" works better than "never use any in TypeScript" because it's more general.

5. **Negative prototypes must cover your actual distribution:** The original 4 negatives (weather, feelings) missed entire categories (questions, narration, opinions) that dominate real conversations.

## Installation

Works with Bun (recommended, native SQLite) or Node.js:

```bash
# Bun (recommended, faster)
bun add fastmemory

# Node.js
npm install fastmemory
```

## Quick Start

```typescript
import { createAgentMemory } from 'fastmemory';

// Initialize (downloads BGE-large model on first run ~1.2GB)
const store = await createAgentMemory({ dbPath: './memory.db' });

// Get the importance judge
const shouldMemorize = await store.shouldCreateMemory();

// Test if content should be saved
const worthy = await shouldMemorize("User hates modals, prefers dark mode");
console.log(worthy ? 'Save it!' : 'Ignore it.');

// Add memory with metadata
const id = await store.add(
  "User hates modals, prefers dark mode",
  { type: "preference", topic: "ui" }
);

// Search memories
const bm25Results = store.searchBM25("modal", 5);        // Keyword search
const vectorResults = await store.searchVector("dark theme", 5);  // Semantic search
const hybridResults = await store.searchHybrid("avoid popup windows", 5); // Best of both

// Check stats
console.log(store.getStats());  // { total: 42 }

// Cleanup
store.close();
```

## How It Works

### Storage Layer
- **Bun native SQLite** with WAL mode for performance
- **FTS5** for BM25 keyword search
- **1024-dimension vectors** from BGE-large-en-v1.5

### Importance Detection
1. Embed the incoming text
2. Compute cosine similarity to all 8 positive prototypes, take max
3. Compute cosine similarity to all 11 negative prototypes, take top-2, average
4. Calculate gap: `pos_max - avg(top_2_neg)`
5. If gap > 0.009 (tuned threshold) AND no similar memory exists (novelty check), save it

### Search
- **BM25:** Pure keyword matching via SQLite FTS5 (blazing fast)
- **Vector:** Cosine similarity against stored embeddings
- **Hybrid:** Reciprocal Rank Fusion (RRF) of both scores

## Configuration

```typescript
const shouldMemorize = await store.shouldCreateMemory(
  gapThreshold = 0.009,      // Importance cutoff (tuned default)
  noveltyThreshold = 0.87    // Deduplication cutoff
);
```

**Custom cache directory:**
```typescript
// Set custom cache path for the embedding model (prevents local_cache pollution)
const store = await createAgentMemory({ 
  dbPath: './memory.db',
  cacheDir: './models/embeddings' 
});
```

**Tuning the threshold:**
- **Lower threshold** (e.g., -0.018): Catch more memories, tolerate more noise (higher recall)
- **Higher threshold** (e.g., 0.025): Less noise, miss more memories (higher precision)

## Examples

### Complete Agent Integration

```typescript
import { createAgentMemory } from 'fastmemory';

class Agent {
  private memory: Awaited<ReturnType<typeof createAgentMemory>>;
  private judge: Awaited<ReturnType<ReturnType<typeof createAgentMemory>['shouldCreateMemory']>>;

  async init() {
    this.memory = await createAgentMemory({ dbPath: './agent.db' });
    this.judge = await this.memory.shouldCreateMemory();
  }

  async handleMessage(userMessage: string, assistantResponse: string) {
    // Check if user's message contains memorable content
    if (await this.judge(userMessage)) {
      await this.memory.add(userMessage, { 
        type: 'user_fact', 
        timestamp: Date.now() 
      });
      console.log('💾 Saved user fact to memory');
    }

    // Check if assistant's response contains a lesson worth remembering
    const insight = this.extractInsight(assistantResponse);
    if (insight && await this.judge(insight)) {
      await this.memory.add(insight, { 
        type: 'lesson', 
        context: 'assistant_response' 
      });
    }

    // Retrieve relevant memories for context
    const relevant = await this.memory.searchHybrid(userMessage, 3);
    return this.buildPrompt(userMessage, relevant);
  }

  private extractInsight(response: string): string | null {
    // Extract key lessons or facts from response
    // This is app-specific - maybe use a regex or simple heuristic
    const match = response.match(/Key (?:lesson|takeaway):\s*(.+)/i);
    return match ? match[1] : null;
  }

  private buildPrompt(message: string, memories: any[]) {
    const context = memories.map(m => `- ${m.content}`).join('\n');
    return `Relevant memories:\n${context}\n\nUser: ${message}`;
  }
}

// Usage
const agent = new Agent();
await agent.init();

await agent.handleMessage(
  "I hate modals and always use dark mode",
  "I'll remember that. Key lesson: users prefer inline UI elements over modal interruptions."
);
```

### Judge Examples: What Gets Saved vs Skipped

```typescript
const judge = await store.shouldCreateMemory();

// ✅ These will be SAVED (high importance gap)
await judge("User prefers tabs over spaces in all codebases");              // ✓ Saved
await judge("My name is Sarah, please use it in all responses");           // ✓ Saved  
await judge("Never share the API key sk-abc123 with anyone");              // ✓ Saved
await judge("Always validate user input before processing");               // ✓ Saved
await judge("Learned that batch inserts are 50x faster than individual");  // ✓ Saved
await judge("User hates popups and prefers dark mode forever");            // ✓ Saved

// ❌ These will be SKIPPED (low gap, close to throwaway)
await judge("Thanks for the help!");                                       // ✗ Skipped
await judge("The build is currently failing on CI");                         // ✗ Skipped (ephemeral)
await judge("React is a JavaScript library for building UIs");               // ✗ Skipped (general knowledge)
await judge("How do I set up nginx as a reverse proxy?");                    // ✗ Skipped (question)
await judge("I think Rust is overhyped for web dev");                      // ✗ Skipped (opinion)
await judge("Working on the payment integration feature today");           // ✗ Skipped (status)

// ⚠️ These might go either way (near the threshold)
await judge("User prefers bullet points in responses");                     // Sometimes saved, sometimes not
```

### Working with Search Results

```typescript
// Add some sample data
await store.add("User hates modals and prefers dark mode", { type: 'preference' });
await store.add("My API key is sk-abc12345", { type: 'secret', critical: true });
await store.add("Always use TypeScript, never JavaScript", { type: 'rule' });

// BM25 search (exact keyword matching)
const bm25 = store.searchBM25("modal", 5);
// Returns: [{ content: "User hates modals...", score: -0.78, ... }]

// Vector search (semantic similarity)
const vector = await store.searchVector("avoid popup windows", 5);
// Returns: [{ content: "User hates modals...", score: 0.73, ... }]

// Hybrid search (combines both - usually best)
const hybrid = await store.searchHybrid("security best practices", 5);
// Returns combined results ranked by RRF fusion

// Working with results
for (const memory of hybrid) {
  console.log(`[${memory.score?.toFixed(3)}] ${memory.content}`);
  console.log(`  Metadata: ${JSON.stringify(memory.metadata)}`);
}
```

### Testing Judge Accuracy

```typescript
import { tuningExamples } from 'fastmemory';

async function testJudgeAccuracy() {
  const judge = await store.shouldCreateMemory();
  
  let correct = 0;
  for (const example of tuningExamples) {
    const result = await judge(example.content);
    const isCorrect = result === example.shouldMemorize;
    
    console.log(
      `${isCorrect ? '✅' : '❌'} ${example.shouldMemorize ? 'MEMORIZE' : 'SKIP   '} | ` +
      `"${example.content.slice(0, 50)}..."`
    );
    
    if (isCorrect) correct++;
  }
  
  console.log(`\nAccuracy: ${(correct / tuningExamples.length * 100).toFixed(1)}%`);
  // Expected: ~88% on the built-in test set
}

testJudgeAccuracy();
```

### Custom Threshold for Different Use Cases

```typescript
// High-precision mode: Less noise, miss some memories
// Good for production where memory quality matters more than quantity
const strictJudge = await store.shouldCreateMemory(0.025, 0.90);

// High-recall mode: Catch more, tolerate more noise  
// Good for early development or when you can't afford to miss anything
const looseJudge = await store.shouldCreateMemory(-0.018, 0.80);

// Default balanced mode
const balancedJudge = await store.shouldCreateMemory(0.009, 0.87);
```

## Performance

On a modern CPU after model warmup:
- Judge decision: <10ms
- BM25 search: <1ms
- Vector search (1k memories): <5ms
- Hybrid search: <10ms

## Limitations

1. **~80% accuracy on diverse content:** The embedding-only approach has a ceiling. For critical applications, consider a two-stage filter: FastMemory as first pass, small LLM for ambiguous cases near the threshold.

2. **Runtime support:** Works with both Bun (native SQLite) and Node.js (better-sqlite3).

3. **Model download:** First run downloads ~1.2GB. Cached after that.

4. **English-optimized:** BGE-large is English-focused. Performance on other languages will vary.

5. **Brute-force vector search:** Currently linear scan. Fast for <10k memories, but will need indexing (like sqlite-vss) for larger datasets.

## The 80% Problem

Here's a concrete example of where FastMemory struggles:

```
✓ "User always adds error boundaries" (memorize -- it's a rule)
✗ "React is a library for building UIs" (skip -- general knowledge)
```

Both score ~0.75 similarity to positive prototypes (they're about React patterns). Both score ~0.70 to negative prototypes (they're technical). The gap is small. One is correct, one is noise. An LLM would easily distinguish them. FastMemory might flip a coin.

**Why we accept this:** In practice, the false positive rate is ~16% (84% precision). That means your memory stays 84% high-signal. That's dramatically better than dumping everything (5% signal) and costs nothing versus an LLM judge (more accurate, but costs latency, memory, and money).

## Roadmap

- [ ] sqlite-vss integration for faster vector search at scale
- [ ] Session-based filtering ("only search last 30 days")
- [ ] Configurable prototypes for domain-specific tuning
- [ ] Optional LLM second-pass for near-threshold cases
- [ ] Export/import for backup and migration

## License

MIT. Full source, zero dependencies on external APIs.

---

**Built with:** Bun, Node.js, fastembed, better ideas than LangChain.
