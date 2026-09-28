import test from "node:test";
import assert from "node:assert/strict";
import { ActionGate, completeWriteOrder, setupRecorder, waitForTransaction } from "../dist/lifecycle.js";

test("duplicate starts run the first action only", async () => {
  const gate = new ActionGate();
  let release;
  let starts = 0;
  const first = gate.run(async () => {
    starts += 1;
    await new Promise(resolve => { release = resolve; });
  });
  const duplicate = await gate.run(async () => { starts += 1; });

  assert.equal(duplicate, undefined);
  assert.equal(starts, 1);
  release();
  await first;
});

test("recorder setup failure releases every microphone track", async () => {
  let stops = 0;
  const stream = { getTracks: () => [{ stop: () => { stops += 1; } }, { stop: () => { stops += 1; } }] };

  await assert.rejects(
    setupRecorder(async () => stream, () => { throw new Error("setup failed"); }),
    /setup failed/,
  );
  assert.equal(stops, 2);
});

test("transaction failure rejects even after request success", async () => {
  const transaction = { error: new Error("commit failed"), oncomplete: null, onerror: null, onabort: null };
  const request = { result: "saved", error: null, onsuccess: null, onerror: null };
  const result = waitForTransaction(transaction, request);

  request.onsuccess();
  transaction.onerror();
  await assert.rejects(result, /commit failed/);
});

test("completion waits for chunk writes, save commit, then chunk clearing", async () => {
  const order = [];
  let finishChunk;
  const chunk = new Promise(resolve => { finishChunk = () => { order.push("chunk"); resolve(); }; });
  const completion = completeWriteOrder(
    [chunk],
    async () => { order.push("session"); },
    async () => { order.push("clear"); },
  );

  await Promise.resolve();
  assert.deepEqual(order, []);
  finishChunk();
  await completion;
  assert.deepEqual(order, ["chunk", "session", "clear"]);
});
