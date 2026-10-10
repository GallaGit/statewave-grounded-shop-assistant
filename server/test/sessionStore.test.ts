import { mock, test } from "node:test";
import assert from "node:assert/strict";
import { createSessionStore } from "../src/sessionStore.js";

test("uses fallbackId when sessionId is missing", () => {
  const store = createSessionStore();
  const session = store.get(undefined, "fallback-123");
  assert.equal(session.id, "fallback-123");
  assert.deepEqual(session.history, []);
});

test("get updates lastSeen on existing sessions", () => {
  const store = createSessionStore();
  const created = store.get("abc", "fallback");
  created.lastSeen = 1;
  const before = Date.now();
  const fetched = store.get("abc", "fallback");
  assert.equal(fetched.id, "abc");
  assert.ok(fetched.lastSeen >= before);
  assert.ok(fetched.lastSeen > 1);
});

test("evicts the oldest session when reaching MAX_SESSIONS", () => {
  const store = createSessionStore();
  const MAX_SESSIONS = 5000;

  for (let i = 0; i < MAX_SESSIONS; i++) {
    const session = store.get(`s-${i}`, `fallback-${i}`);
    session.lastSeen = 1000 + i;
    if (i === 0 || i === MAX_SESSIONS - 1) {
      session.history.push({ role: "user", content: `msg-${i}` });
    }
  }

  const newest = store.get(`s-${MAX_SESSIONS - 1}`, "fallback-newest");
  assert.equal(newest.history[0]?.content, `msg-${MAX_SESSIONS - 1}`);

  const added = store.get("brand-new", "fallback-brand-new");
  assert.equal(added.id, "brand-new");

  const newestAfter = store.get(`s-${MAX_SESSIONS - 1}`, "fallback-newest");
  assert.equal(newestAfter.history[0]?.content, `msg-${MAX_SESSIONS - 1}`);

  const oldestAfter = store.get("s-0", "fallback-s-0");
  assert.deepEqual(oldestAfter.history, []);
});

test(
  "evicts inactive sessions on the TTL sweep",
  { skip: typeof mock.timers?.enable !== "function" && "mock.timers requires Node >= 20.4" },
  () => {
    mock.timers.enable({ apis: ["Date", "setInterval"], now: 1_000_000 });
    try {
      const store = createSessionStore();

      const stale = store.get("stale", "fallback-stale");
      stale.history.push({ role: "user", content: "stale-msg" });

      mock.timers.tick(25 * 60 * 1000);

      const active = store.get("active", "fallback-active");
      active.history.push({ role: "user", content: "active-msg" });

      mock.timers.tick(10 * 60 * 1000);

      const staleAfter = store.get("stale", "fallback-stale");
      assert.deepEqual(staleAfter.history, []);

      const activeAfter = store.get("active", "fallback-active");
      assert.equal(activeAfter.history[0]?.content, "active-msg");
    } finally {
      mock.timers.reset();
    }
  },
);
