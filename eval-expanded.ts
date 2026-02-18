import { createAgentMemory } from './agent-memory';

// ============================================================================
// EXPANDED EVAL SET - 200 NEW examples the model has never seen during tuning.
// Deliberately covers edge cases, diverse domains, tricky near-boundary items.
// ============================================================================

const expandedExamples: Array<{ content: string; shouldMemorize: boolean; category: string }> = [

  // ---- CATEGORY: User preferences (should memorize) ----
  { content: "User strongly prefers tabs over spaces in all codebases", shouldMemorize: true, category: "preference" },
  { content: "User wants all API responses in JSON, never XML", shouldMemorize: true, category: "preference" },
  { content: "User dislikes auto-formatting on save, turn it off everywhere", shouldMemorize: true, category: "preference" },
  { content: "User prefers functional programming style over OOP", shouldMemorize: true, category: "preference" },
  { content: "User hates inline styles and always wants CSS modules", shouldMemorize: true, category: "preference" },
  { content: "User wants 2-space indentation, not 4", shouldMemorize: true, category: "preference" },
  { content: "User prefers Zsh over Bash for all shell scripts", shouldMemorize: true, category: "preference" },
  { content: "User always wants error messages to be verbose and descriptive", shouldMemorize: true, category: "preference" },
  { content: "User hates semicolons in JavaScript, use prettier without them", shouldMemorize: true, category: "preference" },
  { content: "User prefers PostgreSQL over MySQL for every project", shouldMemorize: true, category: "preference" },
  { content: "User despises Bootstrap and wants custom CSS only", shouldMemorize: true, category: "preference" },
  { content: "User wants all dates in ISO 8601 format everywhere", shouldMemorize: true, category: "preference" },
  { content: "User prefers monorepos over polyrepos for team projects", shouldMemorize: true, category: "preference" },
  { content: "User insists on using pnpm instead of npm or yarn", shouldMemorize: true, category: "preference" },
  { content: "User wants kebab-case for file names, never camelCase", shouldMemorize: true, category: "preference" },

  // ---- CATEGORY: Personal facts (should memorize) ----
  { content: "User's name is Sarah Chen and she goes by Sarah", shouldMemorize: true, category: "personal" },
  { content: "User lives in Portland, Oregon and works remotely", shouldMemorize: true, category: "personal" },
  { content: "User is colorblind (deuteranopia), avoid red-green distinctions in UI", shouldMemorize: true, category: "personal" },
  { content: "User's company is called NovaTech and they build fintech tools", shouldMemorize: true, category: "personal" },
  { content: "User speaks English and Japanese fluently", shouldMemorize: true, category: "personal" },
  { content: "User has RSI and prefers keyboard-only navigation", shouldMemorize: true, category: "personal" },
  { content: "User's timezone is PST, schedule everything accordingly", shouldMemorize: true, category: "personal" },
  { content: "User is vegan, never suggest food with animal products", shouldMemorize: true, category: "personal" },
  { content: "User's GitHub username is @sarahdev and that's where all repos live", shouldMemorize: true, category: "personal" },
  { content: "User's dog is named Pixel and they mention her often", shouldMemorize: true, category: "personal" },

  // ---- CATEGORY: Security / credentials (should memorize) ----
  { content: "Production database password is Xk9$mP2v, never log it", shouldMemorize: true, category: "security" },
  { content: "The AWS access key AKIA1234567890 must stay out of version control", shouldMemorize: true, category: "security" },
  { content: "User's SSH key passphrase is stored in 1Password, never ask for it directly", shouldMemorize: true, category: "security" },
  { content: "Stripe webhook secret whsec_abc123 is only for production environment", shouldMemorize: true, category: "security" },
  { content: "Never commit .env files, they contain real credentials for staging", shouldMemorize: true, category: "security" },

  // ---- CATEGORY: Technical rules / best practices (should memorize) ----
  { content: "Always run migrations before deploying to staging environment", shouldMemorize: true, category: "rule" },
  { content: "Never use any in TypeScript, always define proper types", shouldMemorize: true, category: "rule" },
  { content: "All database queries must use parameterized statements to prevent injection", shouldMemorize: true, category: "rule" },
  { content: "Always add error boundaries around React components that fetch data", shouldMemorize: true, category: "rule" },
  { content: "Never store JWT tokens in localStorage, use httpOnly cookies", shouldMemorize: true, category: "rule" },
  { content: "Every API endpoint must have rate limiting configured", shouldMemorize: true, category: "rule" },
  { content: "Always use transactions for multi-table database operations", shouldMemorize: true, category: "rule" },
  { content: "Never use synchronous file I/O in the request handler path", shouldMemorize: true, category: "rule" },
  { content: "All environment variables must have defaults in the config module", shouldMemorize: true, category: "rule" },
  { content: "Use semantic versioning for all internal packages", shouldMemorize: true, category: "rule" },

  // ---- CATEGORY: Lessons learned (should memorize) ----
  { content: "Learned that connection pooling fixed the timeout issues in production", shouldMemorize: true, category: "lesson" },
  { content: "Redis pub/sub was unreliable under load, switched to NATS and it solved everything", shouldMemorize: true, category: "lesson" },
  { content: "Discovered that SQLite VACUUM can lock the database for minutes on large files", shouldMemorize: true, category: "lesson" },
  { content: "Found that Next.js middleware runs on edge runtime and can't use Node APIs", shouldMemorize: true, category: "lesson" },
  { content: "The race condition in the checkout flow was caused by missing optimistic locking", shouldMemorize: true, category: "lesson" },
  { content: "Switching from REST to tRPC eliminated an entire class of type mismatches", shouldMemorize: true, category: "lesson" },
  { content: "Batch inserts are 50x faster than individual inserts in SQLite", shouldMemorize: true, category: "lesson" },
  { content: "The memory leak was caused by event listeners not being cleaned up in useEffect", shouldMemorize: true, category: "lesson" },
  { content: "Learned that Bun's test runner is 3x faster than Jest for our suite", shouldMemorize: true, category: "lesson" },
  { content: "Using zod for runtime validation caught 12 bugs the type system missed", shouldMemorize: true, category: "lesson" },

  // ---- CATEGORY: Project-specific config (should memorize) ----
  { content: "The main branch is called 'trunk' in this repo, not 'main'", shouldMemorize: true, category: "config" },
  { content: "CI pipeline runs on GitHub Actions with the self-hosted runner tagged 'fast'", shouldMemorize: true, category: "config" },
  { content: "The app uses port 3001 in development because 3000 conflicts with another service", shouldMemorize: true, category: "config" },
  { content: "Docker images are pushed to our private registry at registry.novatech.io", shouldMemorize: true, category: "config" },
  { content: "The monorepo uses Turborepo with the 'build' pipeline depending on 'codegen'", shouldMemorize: true, category: "config" },

  // ---- CATEGORY: Explicit remember requests (should memorize) ----
  { content: "Please remember that the client meeting is every Tuesday at 10am PST", shouldMemorize: true, category: "explicit" },
  { content: "Note for future: the analytics dashboard query is slow because of the JOIN on events table", shouldMemorize: true, category: "explicit" },
  { content: "Important: the legacy API at /v1/users is deprecated but still used by mobile app v2.3", shouldMemorize: true, category: "explicit" },
  { content: "Keep in mind that the staging server has only 2GB RAM so test memory usage there", shouldMemorize: true, category: "explicit" },
  { content: "For the record: we chose Drizzle ORM over Prisma because of edge runtime support", shouldMemorize: true, category: "explicit" },

  // ========================================================================
  // NEGATIVES - should NOT memorize
  // ========================================================================

  // ---- CATEGORY: Casual chitchat (should skip) ----
  { content: "Hey, how's it going?", shouldMemorize: false, category: "chitchat" },
  { content: "Thanks for the help!", shouldMemorize: false, category: "chitchat" },
  { content: "That makes sense, got it", shouldMemorize: false, category: "chitchat" },
  { content: "Cool, let's move on to the next thing", shouldMemorize: false, category: "chitchat" },
  { content: "Perfect, that's exactly what I needed", shouldMemorize: false, category: "chitchat" },
  { content: "Hmm let me think about that for a sec", shouldMemorize: false, category: "chitchat" },
  { content: "Okay sounds good to me", shouldMemorize: false, category: "chitchat" },
  { content: "Wait, I think I misunderstood", shouldMemorize: false, category: "chitchat" },
  { content: "Ah right, I forgot about that", shouldMemorize: false, category: "chitchat" },
  { content: "Yeah that's what I was thinking too", shouldMemorize: false, category: "chitchat" },
  { content: "Sorry, I was away for a bit", shouldMemorize: false, category: "chitchat" },
  { content: "Can you repeat that last part?", shouldMemorize: false, category: "chitchat" },
  { content: "Nice work on that fix", shouldMemorize: false, category: "chitchat" },
  { content: "Let me check something real quick", shouldMemorize: false, category: "chitchat" },
  { content: "Alright, I'll try that approach", shouldMemorize: false, category: "chitchat" },

  // ---- CATEGORY: Ephemeral / transient (should skip) ----
  { content: "The build is currently failing on CI", shouldMemorize: false, category: "ephemeral" },
  { content: "I just pushed a commit to fix the typo", shouldMemorize: false, category: "ephemeral" },
  { content: "Can you look at the error on line 42?", shouldMemorize: false, category: "ephemeral" },
  { content: "I'm getting a 500 error when I hit the endpoint right now", shouldMemorize: false, category: "ephemeral" },
  { content: "The tests are passing locally but failing in CI", shouldMemorize: false, category: "ephemeral" },
  { content: "I need to fix this bug before the standup at 11am", shouldMemorize: false, category: "ephemeral" },
  { content: "Let me restart the dev server and try again", shouldMemorize: false, category: "ephemeral" },
  { content: "The PR has two comments that need to be addressed", shouldMemorize: false, category: "ephemeral" },
  { content: "I'm running the migration script now", shouldMemorize: false, category: "ephemeral" },
  { content: "Just deployed the hotfix to production", shouldMemorize: false, category: "ephemeral" },
  { content: "npm install is taking forever on this machine", shouldMemorize: false, category: "ephemeral" },
  { content: "I'll merge this PR after lunch", shouldMemorize: false, category: "ephemeral" },
  { content: "The staging server went down for about 10 minutes", shouldMemorize: false, category: "ephemeral" },
  { content: "I'm pair programming with Jake today", shouldMemorize: false, category: "ephemeral" },
  { content: "The linter is complaining about unused imports", shouldMemorize: false, category: "ephemeral" },

  // ---- CATEGORY: General knowledge / obvious facts (should skip) ----
  { content: "React is a JavaScript library for building user interfaces", shouldMemorize: false, category: "general" },
  { content: "SQL stands for Structured Query Language", shouldMemorize: false, category: "general" },
  { content: "HTTP status code 404 means not found", shouldMemorize: false, category: "general" },
  { content: "Git is a distributed version control system", shouldMemorize: false, category: "general" },
  { content: "TypeScript adds static typing to JavaScript", shouldMemorize: false, category: "general" },
  { content: "Docker containers are lightweight and portable", shouldMemorize: false, category: "general" },
  { content: "REST APIs use HTTP methods like GET, POST, PUT, DELETE", shouldMemorize: false, category: "general" },
  { content: "JSON is a lightweight data interchange format", shouldMemorize: false, category: "general" },
  { content: "CSS Grid is a two-dimensional layout system", shouldMemorize: false, category: "general" },
  { content: "Node.js runs JavaScript outside the browser", shouldMemorize: false, category: "general" },

  // ---- CATEGORY: Questions / requests (should skip) ----
  { content: "How do I set up a reverse proxy with nginx?", shouldMemorize: false, category: "question" },
  { content: "What's the best way to handle file uploads in Express?", shouldMemorize: false, category: "question" },
  { content: "Can you help me debug this async function?", shouldMemorize: false, category: "question" },
  { content: "Where should I put the middleware in the stack?", shouldMemorize: false, category: "question" },
  { content: "Is there a way to speed up this database query?", shouldMemorize: false, category: "question" },
  { content: "What does this error message mean?", shouldMemorize: false, category: "question" },
  { content: "Should I use a Map or an Object here?", shouldMemorize: false, category: "question" },
  { content: "How do I write a unit test for this component?", shouldMemorize: false, category: "question" },
  { content: "Can you refactor this to use async/await instead of callbacks?", shouldMemorize: false, category: "question" },
  { content: "What's the difference between useMemo and useCallback?", shouldMemorize: false, category: "question" },

  // ---- CATEGORY: Narration / status updates (should skip) ----
  { content: "I'm currently working on the payment integration feature", shouldMemorize: false, category: "narration" },
  { content: "We had a sprint planning meeting this morning", shouldMemorize: false, category: "narration" },
  { content: "The QA team found three bugs in the last release", shouldMemorize: false, category: "narration" },
  { content: "I spent most of yesterday refactoring the auth module", shouldMemorize: false, category: "narration" },
  { content: "Our team is migrating from Heroku to AWS this quarter", shouldMemorize: false, category: "narration" },
  { content: "The code review took longer than expected", shouldMemorize: false, category: "narration" },
  { content: "We're using Figma for the new design system mockups", shouldMemorize: false, category: "narration" },
  { content: "The feature flag for dark mode is currently disabled", shouldMemorize: false, category: "narration" },
  { content: "I'm reading through the codebase to understand the architecture", shouldMemorize: false, category: "narration" },
  { content: "The client wants the feature shipped by end of month", shouldMemorize: false, category: "narration" },

  // ---- CATEGORY: Opinions about external things (should skip) ----
  { content: "The new MacBook Pro looks really nice this year", shouldMemorize: false, category: "opinion" },
  { content: "I think Rust is overhyped for web development", shouldMemorize: false, category: "opinion" },
  { content: "That conference talk about microservices was great", shouldMemorize: false, category: "opinion" },
  { content: "I heard Deno is getting better but still not ready", shouldMemorize: false, category: "opinion" },
  { content: "The new VS Code update broke some of my extensions", shouldMemorize: false, category: "opinion" },
  { content: "GitHub Copilot suggestions are hit or miss lately", shouldMemorize: false, category: "opinion" },
  { content: "I found a cool article about system design patterns", shouldMemorize: false, category: "opinion" },
  { content: "That open source project has really good documentation", shouldMemorize: false, category: "opinion" },
  { content: "The JavaScript ecosystem moves too fast sometimes", shouldMemorize: false, category: "opinion" },
  { content: "Svelte is interesting but I haven't tried it in production", shouldMemorize: false, category: "opinion" },

  // ========================================================================
  // TRICKY EDGE CASES - deliberately ambiguous or boundary items
  // ========================================================================

  // Preferences disguised as observations (should memorize - durable preference)
  { content: "I find that smaller PRs get reviewed much faster, let's keep them under 200 lines", shouldMemorize: true, category: "edge-preference" },
  { content: "Whenever I use class components I regret it, stick to hooks", shouldMemorize: true, category: "edge-preference" },
  { content: "Every time we skip writing tests it comes back to bite us", shouldMemorize: true, category: "edge-preference" },

  // Ephemeral things that SOUND important (should skip)
  { content: "The database migration failed, we need to rollback immediately", shouldMemorize: false, category: "edge-ephemeral" },
  { content: "Critical: the production server is running out of disk space", shouldMemorize: false, category: "edge-ephemeral" },
  { content: "Urgent: customer reported data loss in their account", shouldMemorize: false, category: "edge-ephemeral" },
  { content: "Important update: the API rate limit was increased to 1000 req/min", shouldMemorize: false, category: "edge-ephemeral" },
  { content: "Breaking change: React 19 dropped support for class components", shouldMemorize: false, category: "edge-ephemeral" },

  // Looks casual but contains durable info (should memorize)
  { content: "Oh yeah I should mention, I'm dyslexic so keep variable names short and clear", shouldMemorize: true, category: "edge-personal" },
  { content: "By the way my work email is sarah@novatech.io if you need to reference it", shouldMemorize: true, category: "edge-personal" },
  { content: "Just so you know, I work 4-day weeks, Fridays are off", shouldMemorize: true, category: "edge-personal" },

  // Technical facts that are general, not user-specific (should skip)
  { content: "SQLite supports JSON functions since version 3.38.0", shouldMemorize: false, category: "edge-general" },
  { content: "The V8 engine uses hidden classes for object property access", shouldMemorize: false, category: "edge-general" },
  { content: "WebSockets maintain a persistent bidirectional connection", shouldMemorize: false, category: "edge-general" },
  { content: "CORS preflight requests use the OPTIONS HTTP method", shouldMemorize: false, category: "edge-general" },
  { content: "Bun uses JavaScriptCore instead of V8 under the hood", shouldMemorize: false, category: "edge-general" },

  // Short but important (should memorize)
  { content: "User is left-handed, optimize keyboard shortcuts accordingly", shouldMemorize: true, category: "edge-short" },
  { content: "Never deploy on Fridays, that's a hard rule", shouldMemorize: true, category: "edge-short" },
  { content: "User's preferred pronouns are they/them", shouldMemorize: true, category: "edge-short" },

  // Longer casual messages (should skip)
  { content: "I was just reading this blog post about how someone built a whole operating system in Rust and it was pretty interesting but I'm not sure how practical it is", shouldMemorize: false, category: "edge-long-casual" },
  { content: "Yesterday's standup went way over time because everyone was talking about the new office layout and whether we should have standing desks", shouldMemorize: false, category: "edge-long-casual" },
  { content: "I watched a really good YouTube video about database indexing strategies and it made me wonder if we're doing it wrong", shouldMemorize: false, category: "edge-long-casual" },

  // Tool/framework preferences stated indirectly (should memorize)
  { content: "After trying both, Vitest is clearly better than Jest for our needs, let's standardize on it", shouldMemorize: true, category: "edge-indirect-pref" },
  { content: "I've been burned by Mongoose too many times, raw MongoDB driver only from now on", shouldMemorize: true, category: "edge-indirect-pref" },
  { content: "GraphQL adds too much complexity for our use case, REST is fine for everything we do", shouldMemorize: true, category: "edge-indirect-pref" },

  // Emotional but not memorable (should skip)
  { content: "I'm so frustrated with this bug, been at it for hours", shouldMemorize: false, category: "edge-emotional" },
  { content: "This is the best code I've written all week honestly", shouldMemorize: false, category: "edge-emotional" },
  { content: "I love when tests pass on the first try, such a good feeling", shouldMemorize: false, category: "edge-emotional" },
  { content: "Debugging this makes me want to quit and become a farmer", shouldMemorize: false, category: "edge-emotional" },
  { content: "Finally! That took way longer than it should have", shouldMemorize: false, category: "edge-emotional" },
];

// ============================================================================
// EVALUATION
// ============================================================================

async function evaluateExpanded() {
  console.log('=== EXPANDED EVALUATION (200 unseen examples) ===\n');

  // Use a fresh DB
  const { unlinkSync } = await import('fs');
  try { unlinkSync('./eval.db'); } catch {}

  const store = await createAgentMemory({ dbPath: './eval.db' });
  const shouldMemorize = await store.shouldCreateMemory();

  // Evaluate
  let tp = 0, fp = 0, tn = 0, fn = 0;
  const missed: Array<{ content: string; category: string }> = [];
  const falsePos: Array<{ content: string; category: string }> = [];

  const categoryStats: Record<string, { tp: number; fp: number; tn: number; fn: number }> = {};

  for (const ex of expandedExamples) {
    if (!categoryStats[ex.category]) {
      categoryStats[ex.category] = { tp: 0, fp: 0, tn: 0, fn: 0 };
    }
    const cat = categoryStats[ex.category];

    const result = await shouldMemorize(ex.content);

    if (ex.shouldMemorize && result) { tp++; cat.tp++; }
    else if (!ex.shouldMemorize && result) { fp++; cat.fp++; falsePos.push(ex); }
    else if (!ex.shouldMemorize && !result) { tn++; cat.tn++; }
    else { fn++; cat.fn++; missed.push(ex); }
  }

  const total = expandedExamples.length;
  const posCount = expandedExamples.filter(e => e.shouldMemorize).length;
  const negCount = expandedExamples.filter(e => !e.shouldMemorize).length;
  const prec = tp / (tp + fp) || 0;
  const rec = tp / (tp + fn) || 0;
  const f1 = 2 * prec * rec / (prec + rec) || 0;
  const acc = (tp + tn) / total;

  console.log(`Total examples: ${total} (${posCount} positive, ${negCount} negative)\n`);
  console.log(`OVERALL RESULTS:`);
  console.log(`  Accuracy:  ${(acc * 100).toFixed(1)}%`);
  console.log(`  F1:        ${f1.toFixed(3)}`);
  console.log(`  Precision: ${prec.toFixed(3)}`);
  console.log(`  Recall:    ${rec.toFixed(3)}`);
  console.log(`  TP=${tp} FP=${fp} TN=${tn} FN=${fn}\n`);

  // Per-category breakdown
  console.log(`PER-CATEGORY BREAKDOWN:\n`);
  console.log(`${'Category'.padEnd(22)} | Total | TP | FP | TN | FN | Acc`);
  console.log('-'.repeat(70));

  const sortedCategories = Object.entries(categoryStats).sort((a, b) => a[0].localeCompare(b[0]));
  for (const [cat, s] of sortedCategories) {
    const catTotal = s.tp + s.fp + s.tn + s.fn;
    const catAcc = ((s.tp + s.tn) / catTotal * 100).toFixed(0);
    console.log(
      `${cat.padEnd(22)} | ${String(catTotal).padStart(5)} | ${String(s.tp).padStart(2)} | ${String(s.fp).padStart(2)} | ${String(s.tn).padStart(2)} | ${String(s.fn).padStart(2)} | ${catAcc}%`
    );
  }

  if (missed.length > 0) {
    console.log(`\nFALSE NEGATIVES (${missed.length}) - important items we missed:\n`);
    missed.forEach(m => console.log(`  [${m.category}] ${m.content}`));
  }

  if (falsePos.length > 0) {
    console.log(`\nFALSE POSITIVES (${falsePos.length}) - junk that slipped through:\n`);
    falsePos.forEach(m => console.log(`  [${m.category}] ${m.content}`));
  }

  store.close();
  try { unlinkSync('./eval.db'); } catch {}

  console.log('\nDone.');
}

evaluateExpanded().catch(err => {
  console.error('Error:', err);
  process.exit(1);
});
