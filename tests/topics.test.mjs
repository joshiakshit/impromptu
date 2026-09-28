import test from "node:test";
import assert from "node:assert/strict";
import { topics, topicCategories, topicsForCategory } from "../dist/topics.js";

test("categories cover the full bank without duplicates", () => {
  const categorized = topicCategories.flatMap(category => topicsForCategory(category));
  assert.equal(topics.length, 1000);
  assert.equal(categorized.length, topics.length);
  assert.equal(new Set(categorized).size, topics.length);
  assert.deepEqual(new Set(categorized), new Set(topics));
  assert.deepEqual(topicsForCategory("Any category"), topics);
});

test("categories contain relevant topics", () => {
  assert.ok(topicsForCategory("Everyday life").includes("A habit that changed my life"));
  assert.ok(topicsForCategory("Work").includes("Remote work is better than office work"));
  assert.ok(topicsForCategory("Abstract ideas").includes("The power of silence"));
  assert.ok(topicsForCategory("Society").includes("Voting should be compulsory"));
  for (const category of topicCategories) assert.ok(topicsForCategory(category).length > 1);
});
