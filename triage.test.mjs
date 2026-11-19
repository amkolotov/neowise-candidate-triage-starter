import assert from "node:assert/strict";
import { once } from "node:events";
import { after, before, test } from "node:test";
import { createTriageServer } from "./server.mjs";

const server = createTriageServer();

before(async () => {
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
});

after(async () => {
  if (!server.listening) return;
  await new Promise((resolve) => server.close(resolve));
});

async function triage(text) {
  const { port } = server.address();
  const response = await fetch(`http://127.0.0.1:${port}/api/triage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text }),
  });
  return [response.status, await response.json()];
}

test("returns a topic and draft for a valid inquiry", async () => {
  assert.deepEqual(await triage("Когда будет доставка?"), [200, {
    status: "ready",
    topic: "delivery",
    draft: "Спасибо за обращение. Уточним детали заявки.",
  }]);
});

test("rejects whitespace-only input", async () => {
  assert.deepEqual(await triage("  "), [400, { status: "invalid_input" }]);
});

const manualReview = [200, { status: "manual_review", topic: null, draft: null }];

for (const marker of ["[error]", "[bad-json]", "[bad-topic]", "[empty-draft]"]) {
  test(`falls back to manual review for ${marker}`, async () => {
    assert.deepEqual(await triage(marker), manualReview);
  });
}

test("falls back to manual review when the model times out", async () => {
  const started = performance.now();
  assert.deepEqual(await triage("[timeout]"), manualReview);
  assert.ok(performance.now() - started < 1_000, "Expected a response before the mock's 1,200 ms delay");
});
