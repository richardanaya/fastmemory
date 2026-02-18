import { createAgentMemory, tuningExamples } from './agent-memory';

async function runDemo() {
  console.log('=== Agent Memory Demo ===\n');

  // Clean up previous run
  const { unlinkSync } = await import('fs');
  try { unlinkSync('./sample.db'); } catch {}

  const store = await createAgentMemory({ dbPath: './sample.db' });
  console.log('Store initialized\n');

  // Get the dual-prototype memory judge (tuned defaults: gap >= -0.047)
  const shouldMemorize = await store.shouldCreateMemory();

  // --- Test judge accuracy on full eval set ---
  console.log(`Testing judge on ${tuningExamples.length} labeled examples...\n`);

  let tp = 0, fp = 0, tn = 0, fn = 0;
  const missed: string[] = [];
  const falsePos: string[] = [];

  for (const ex of tuningExamples) {
    const result = await shouldMemorize(ex.content);
    if (ex.shouldMemorize && result) tp++;
    else if (!ex.shouldMemorize && result) { fp++; falsePos.push(ex.content); }
    else if (!ex.shouldMemorize && !result) tn++;
    else { fn++; missed.push(ex.content); }
  }

  const prec = tp / (tp + fp) || 0;
  const rec = tp / (tp + fn) || 0;
  const f1 = 2 * prec * rec / (prec + rec) || 0;
  const acc = (tp + tn) / tuningExamples.length;

  console.log(`Accuracy: ${(acc * 100).toFixed(1)}%`);
  console.log(`F1: ${f1.toFixed(3)} | Precision: ${prec.toFixed(2)} | Recall: ${rec.toFixed(2)}`);
  console.log(`TP=${tp} FP=${fp} TN=${tn} FN=${fn}\n`);

  if (missed.length > 0) {
    console.log(`Missed (${missed.length}):`);
    missed.forEach(m => console.log(`  - ${m}`));
    console.log();
  }
  if (falsePos.length > 0) {
    console.log(`False positives (${falsePos.length}):`);
    falsePos.forEach(m => console.log(`  - ${m}`));
    console.log();
  }

  // --- Add memories that pass the judge ---
  console.log('--- Adding memories ---\n');

  const candidates = [
    { content: "User explicitly hates modal popups and prefers dark mode always", metadata: { type: "preference", topic: "ui" } },
    { content: "My API key is sk-xyz123, never share it with anyone", metadata: { type: "secret", topic: "security" } },
    { content: "User prefers all code examples in TypeScript only", metadata: { type: "preference", topic: "code" } },
    { content: "Always validate user input before processing", metadata: { type: "lesson", topic: "security" } },
    { content: "User's birthday is June 15th, remind them yearly", metadata: { type: "fact", topic: "personal" } },
    { content: "The weather is nice today", metadata: { type: "chat" } },
    { content: "LOL that's funny", metadata: { type: "chat" } },
  ];

  for (const c of candidates) {
    const worthy = await shouldMemorize(c.content);
    if (worthy) {
      const id = await store.add(c.content, c.metadata);
      console.log(`  STORED: "${c.content.slice(0, 55)}..." (${id.slice(0, 8)})`);
    } else {
      console.log(`  SKIPPED: "${c.content.slice(0, 55)}..."`);
    }
  }

  console.log(`\nStats: ${JSON.stringify(store.getStats())}\n`);

  // --- Search tests ---
  console.log('--- BM25 search: "modal" ---\n');
  const bm25 = store.searchBM25("modal", 3);
  bm25.forEach((r, i) => console.log(`  ${i+1}. [${r.score?.toFixed(3)}] ${r.content.slice(0, 60)}`));

  console.log('\n--- Vector search: "user interface preferences" ---\n');
  const vec = await store.searchVector("user interface preferences", 3);
  vec.forEach((r, i) => console.log(`  ${i+1}. [${r.score?.toFixed(3)}] ${r.content.slice(0, 60)}`));

  console.log('\n--- Hybrid search: "security best practices" ---\n');
  const hybrid = await store.searchHybrid("security best practices", 3);
  hybrid.forEach((r, i) => console.log(`  ${i+1}. [${r.score?.toFixed(3)}] ${r.content.slice(0, 60)}`));

  // --- Novelty detection ---
  console.log('\n--- Novelty detection ---\n');
  const dupe = "User hates popups and modals forever";
  const isNovel = await shouldMemorize(dupe);
  console.log(`  "${dupe}"`);
  console.log(`  Result: ${isNovel ? 'NOVEL (would store)' : 'DUPLICATE (rejected)'}`);

  store.close();
  console.log('\nDone.');
}

runDemo().catch(err => {
  console.error('Error:', err);
  process.exit(1);
});
