# Memory Research: How We Built a Zero-Cost Memory Judge

## The Problem

When an AI agent talks to a user, thousands of messages fly by. Most are throwaway -- "thanks!", "how's it going?", "the build is failing." But some are gold: "I hate modals", "my API key is sk-abc123", "always use TypeScript." 

We needed a way to automatically decide: **should this sentence be saved as a permanent memory?** And we wanted to do it with zero API calls, zero cost, fully offline.

## The Approach: Embeddings as a Judge

We used a local embedding model (BGE-large, 1024 dimensions) that converts text into arrays of numbers. Similar sentences end up as similar arrays. The idea: compare incoming text against "prototype" sentences that represent what memorable content looks like, and see how close they are.

Think of it like sorting mail. You have example letters for "important" and "junk." When a new letter arrives, you check which pile it looks more like.

## Round 1: Single-Sided Prototypes (Failed)

We started with 5 prototype sentences describing memorable content:

- "strong user preference or explicit dislike"
- "important long-term fact the user wants remembered"
- etc.

We scored each incoming sentence by how similar it was to the closest prototype. If the score was above a threshold, memorize it.

**Result: 61% accuracy.** Basically random.

**Why it failed:** The positive and negative examples had *completely overlapping* scores. "I like this song" scored 0.773 (should skip) while "User prefers bullet points" scored 0.783 (should memorize). The model sees both as "preferences" -- it can't tell that one is fleeting and the other is permanent. The average score for things we should memorize (0.692) was actually *lower* than the average for things we should skip (0.696).

## Round 2: Better Prototypes (Helped Some)

We tried making prototypes more concrete -- instead of abstract descriptions, we used example-like sentences:

- "remember this forever: user always wants TypeScript and hates modals"
- "critical secret: API key sk-abc123 must never be shared"

**Result: 71.4% accuracy, F1=0.746.** Better, but still 12 false positives. Casual sentences like "I like this song" and "This chat is going well" kept slipping through because they're topically similar to real preferences.

## Round 3: The Breakthrough -- Dual Prototypes

The key insight: instead of asking "does this look memorable?", ask **"does this look MORE memorable than throwaway?"**

We added a second set of *negative* prototypes describing junk content:

- "casual small talk about weather food feelings and daily life"
- "momentary reaction: laughing agreeing feeling tired having lunch"

For each sentence, we compute:
```
gap = (similarity to best positive prototype) - (similarity to best negative prototype)
```

If the gap is positive, the sentence is closer to "memorable" than "throwaway." If negative, it's closer to junk.

**Result on original 49 examples: 95.9% accuracy, F1=0.960.** Only 1 miss and 1 false positive. The gap metric completely eliminated the overlap problem.

## Round 4: Reality Check -- Expanded Testing

We generated 160 new test sentences the model had never seen, covering:
- Preferences, personal facts, security, rules, lessons, config (should memorize)
- Chitchat, ephemeral events, general knowledge, questions, narration, opinions, emotions (should skip)
- Tricky edge cases in both directions

**Result with original prototypes: 51.2% accuracy.** The original 4 negative prototypes only covered "casual/feelings/weather." They didn't cover questions, general tech knowledge, status updates, or opinions -- which are the bulk of real agent conversations.

## Round 5: Scaling Up Prototypes

We expanded to 8 positive and 11 negative prototypes, covering all the failure categories:

**Positive (8 prototypes):**
- Permanent tool/framework preferences
- Personal identity (name, birthday, disability, pronouns)
- Permanent project rules (always/never)
- Lessons from real experience
- Persistent project config
- Explicit "remember this" requests
- Work schedule and accessibility needs
- Casually mentioned personal facts

**Negative (11 prototypes):**
- Casual chat and greetings
- Ephemeral events (builds, deploys, current bugs)
- General tech knowledge (what React is, how HTTP works)
- Questions and help requests
- Status narration (meetings, sprints, progress)
- Opinions about external tech
- Emotional reactions
- Plus 4 concrete example-style negatives for extra coverage

We also switched from `max(neg)` to `avg(top-2 neg)` for the negative score, which improved precision because a single outlier negative match is less likely to wrongly suppress a real memory.

**Final result on 209 examples: 79.4% accuracy, F1=0.757, Precision=0.84, Recall=0.69.**

## What We Tried That Didn't Help

- **Using actual positive examples as prototypes** -- Counterintuitively, this was terrible (69.4% accuracy). The prototypes need to be *general archetypes*, not specific examples, because specific examples are too close to specific negatives.
- **More scoring strategies** (avg top-2 pos, avg top-3 neg, etc.) -- All landed in the same ~76-80% band. The ceiling is set by the prototypes and the embedding model, not the math.
- **Very long, kitchen-sink prototypes** -- Stuffing everything into one mega-prototype diluted the signal. 5-8 focused prototypes per side worked best.

## The Fundamental Limitation

Embeddings measure **topical similarity**, not **intent to persist**. These two sentences are nearly identical in embedding space:

- "Always add error boundaries around React components" (should memorize -- it's a rule)
- "React is a library for building user interfaces" (should skip -- it's general knowledge)

Both are about React. Both are technical. The difference is whether it's *a rule this specific user set* vs. *a fact anyone could Google*. That distinction requires understanding intent, which is beyond what cosine similarity can capture.

## Final Takeaways

1. **Dual prototypes (positive + negative) are far superior to single-sided.** The gap metric eliminates the score overlap problem that makes single-sided approaches nearly random.

2. **~80% accuracy is the practical ceiling for embedding-only judges on diverse content.** Good enough as a zero-cost first filter. For the remaining ~20% ambiguous cases, you'd need a small LLM or fine-tuned classifier.

3. **Prototypes should be archetypal descriptions, not literal examples.** "permanent project rule: always do X and never do Y" works better than "never use any in TypeScript."

4. **Negative prototypes need to cover your actual content distribution.** The original 4 negatives (weather, feelings, news, opinions) missed entire categories (questions, general knowledge, narration) that dominate real conversations.

5. **Precision vs. recall is tunable via a single threshold.** At gap >= 0.009, you get 84% precision / 69% recall. Lower the threshold for more recall (catch more, tolerate more noise). Raise it for precision (less noise, miss more).

6. **The approach costs literally nothing at runtime.** No API calls, no tokens, no network. One local embedding model handles both storage and judging. Sub-10ms per decision after model warmup.

## Configuration

```typescript
// In agent-memory.ts, the final tuned values:
gapThreshold = 0.009    // memory importance cutoff
noveltyThreshold = 0.87  // deduplication cutoff

// 8 positive prototypes + 11 negative prototypes
// Scoring: max(pos_similarity) - avg(top_2_neg_similarities)
```
