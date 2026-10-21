import assert from "node:assert/strict";
import { test } from "node:test";
import { build } from "esbuild";
import { fileURLToPath } from "node:url";

const bundle = await build({
  stdin: {
    contents: `export * from './src/shared/engine'; export { DEFAULT_ROOM_INPUT } from './src/shared/defaults';`,
    resolveDir: fileURLToPath(new URL("../", import.meta.url)),
    loader: "ts",
  },
  bundle: true, write: false, format: "esm", platform: "node",
});
const { syncClock, syncRoomState, applyCommand, createRoomState, DEFAULT_ROOM_INPUT } = await import(
  `data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].text).toString("base64")}`
);

function clock(overrides = {}) {
  return {
    affirmativeRemainingMs: 1000, negativeRemainingMs: 20000, totalRemainingMs: 60000,
    activeSide: "affirmative", isRunning: true, currentRound: 1, updatedAt: 10000,
    ...overrides,
  };
}

function room(overrides = {}) {
  const result = createRoomState("clock-test", DEFAULT_ROOM_INPUT,
    { host: "h", viewer: "v", affirmative: "a", negative: "n" }, 10000);
  result.clock = clock(overrides);
  return result;
}

for (const side of ["affirmative", "negative"]) {
  test(`${side}: delayed sync stops at the speaker deadline and preserves the other side`, () => {
    const input = clock({ activeSide: side, [`${side}RemainingMs`]: 1000 });
    const original = structuredClone(input);
    const result = syncClock(input, 20000);
    assert.equal(result.totalRemainingMs, 59000);
    assert.equal(result[`${side}RemainingMs`], 0);
    const other = side === "affirmative" ? "negative" : "affirmative";
    assert.equal(result[`${other}RemainingMs`], input[`${other}RemainingMs`]);
    assert.equal(result.updatedAt, 11000);
    assert.equal(result.isRunning, false);
    assert.deepEqual(input, original, "sync must not mutate the snapshot");
    assert.deepEqual(syncClock(result, 999999), result, "stopped clock must stay stopped");
  });
}

test("total deadline stops the speaker's clock without deducting the delayed interval", () => {
  const result = syncClock(clock({ affirmativeRemainingMs: 20000, totalRemainingMs: 1000 }), 20000);
  assert.equal(result.affirmativeRemainingMs, 19000);
  assert.equal(result.totalRemainingMs, 0);
  assert.equal(result.updatedAt, 11000);
  assert.equal(result.isRunning, false);
});

test("simultaneous deadlines stop at the exact millisecond", () => {
  const result = syncClock(clock({ affirmativeRemainingMs: 1250, totalRemainingMs: 1250 }), 20000);
  assert.equal(result.affirmativeRemainingMs, 0);
  assert.equal(result.totalRemainingMs, 0);
  assert.equal(result.updatedAt, 11250);
  assert.equal(result.isRunning, false);
});

test("poll frequency cannot change the clock, before or after either deadline", () => {
  for (const side of ["affirmative", "negative"]) {
    for (const remaining of [0, 1, 1000, 1250, 30000]) {
      for (const total of [0, 1, 750, 1000, 60000]) {
        const input = clock({ activeSide: side, [`${side}RemainingMs`]: remaining, totalRemainingMs: total });
        for (const target of [10000, 10500, 11000, 20000]) {
          let frequent = input;
          for (let now = 10000; now < target; now += 137) frequent = syncClock(frequent, now);
          frequent = syncClock(frequent, target);
          assert.deepEqual(frequent, syncClock(input, target), `${side}, balance=${remaining}, total=${total}, now=${target}`);
        }
      }
    }
  }
});

test("already exhausted running snapshots stop without charging the other balance", () => {
  for (const balances of [{ affirmativeRemainingMs: 0 }, { totalRemainingMs: 0 }]) {
    const input = clock(balances);
    assert.deepEqual(syncClock(input, input.updatedAt), { ...input, isRunning: false });
    assert.deepEqual(syncClock(input, 20000), { ...input, isRunning: false });
  }
});

test("paused, idle and backwards-time snapshots do not consume time", () => {
  for (const input of [clock({ isRunning: false }), clock({ activeSide: null })]) {
    assert.deepEqual(syncClock(input, 20000), input);
  }
  assert.deepEqual(syncClock(clock(), 9000), clock());
});

test("pause and resume exclude time spent paused", () => {
  let value = room({ affirmativeRemainingMs: 10000 });
  value = applyCommand(value, { type: "pause" }, 12000, "host");
  assert.equal(value.clock.affirmativeRemainingMs, 8000);
  value = applyCommand(value, { type: "resume" }, 20000, "host");
  value = syncRoomState(value, 23000);
  assert.equal(value.clock.affirmativeRemainingMs, 5000);
  assert.equal(value.clock.totalRemainingMs, 55000);
});

test("switching while running charges each side only for its own speaking interval", () => {
  let value = room({ affirmativeRemainingMs: 10000 });
  value = applyCommand(value, { type: "switch-side" }, 12000, "host");
  value = syncRoomState(value, 15000);
  assert.equal(value.clock.affirmativeRemainingMs, 8000);
  assert.equal(value.clock.negativeRemainingMs, 17000);
  assert.equal(value.clock.totalRemainingMs, 55000);
  assert.equal(value.clock.isRunning, true);
});

test("after a delayed timeout the other side can resume without paying for the idle gap", () => {
  let value = applyCommand(room(), { type: "switch-side" }, 20000, "host");
  assert.equal(value.clock.totalRemainingMs, 59000);
  assert.equal(value.clock.isRunning, false);
  value = applyCommand(value, { type: "resume" }, 30000, "host");
  value = syncRoomState(value, 32000);
  assert.equal(value.clock.affirmativeRemainingMs, 0);
  assert.equal(value.clock.negativeRemainingMs, 18000);
  assert.equal(value.clock.totalRemainingMs, 57000);
  assert.equal(value.clock.isRunning, true);
});

test("ending a turn before timeout preserves the bonus and subsequent timing", () => {
  let value = applyCommand(room({ affirmativeRemainingMs: 10000 }), { type: "end-turn" }, 11000, "affirmative");
  assert.equal(value.clock.affirmativeRemainingMs, 249000);
  assert.equal(value.roundHistory.length, 1);
  value = syncRoomState(value, 14000);
  assert.equal(value.clock.negativeRemainingMs, 17000);
  assert.equal(value.clock.totalRemainingMs, 56000);
});

function pausedWithBonus() {
  let value = room({ affirmativeRemainingMs: 600000, negativeRemainingMs: 600000, totalRemainingMs: 4500000 });
  value = applyCommand(value, { type: "end-turn" }, 11000, "affirmative");
  return applyCommand(value, { type: "pause" }, 11000, "host");
}

test("saving identical config preserves earned bonus, history and subsequent timing", () => {
  const before = pausedWithBonus();
  assert.equal(before.clock.affirmativeRemainingMs, 839000);
  let value = applyCommand(before, { type: "update-config", config: before.config }, 20000, "host");
  assert.deepEqual(value.clock, before.clock);
  assert.deepEqual(value.roundHistory, before.roundHistory);
  value = applyCommand(value, { type: "resume" }, 30000, "host");
  value = syncRoomState(value, 32000);
  assert.equal(value.clock.affirmativeRemainingMs, 839000);
  assert.equal(value.clock.negativeRemainingMs, 598000);
  assert.equal(value.clock.totalRemainingMs, 4497000);
});

test("saving config preserves manual additions for both sides and the total", () => {
  let before = pausedWithBonus();
  for (const side of ["affirmative", "negative", "total"]) {
    before = applyCommand(before, { type: "adjust-time", side, amountSeconds: 300 }, 12000, "host");
  }
  const value = applyCommand(before, { type: "update-config", config: before.config }, 20000, "host");
  assert.deepEqual(value.clock, before.clock);
});

test("changing configured durations preserves current balances; reset applies new durations", () => {
  const before = pausedWithBonus();
  for (const [initialTimeSeconds, maxDurationSeconds] of [[300, 1800], [900, 7200]]) {
    const config = { ...before.config, initialTimeSeconds, maxDurationSeconds };
    const value = applyCommand(before, { type: "update-config", config }, 20000, "host");
    assert.deepEqual(value.clock, before.clock);
    assert.deepEqual(value.config, config);
    const reset = applyCommand(value, { type: "reset" }, 30000, "host");
    assert.equal(reset.clock.affirmativeRemainingMs, initialTimeSeconds * 1000);
    assert.equal(reset.clock.negativeRemainingMs, initialTimeSeconds * 1000);
    assert.equal(reset.clock.totalRemainingMs, maxDurationSeconds * 1000);
    assert.equal(reset.clock.activeSide, null);
    assert.equal(reset.clock.isRunning, false);
    assert.equal(reset.roundHistory.length, 0);
  }
});

test("changed bonus rules affect subsequent turns without rewriting earned time or history", () => {
  const before = pausedWithBonus();
  const config = { ...before.config, bonusRules: [{ startRound: 1, endRound: null, bonusSeconds: 10 }] };
  let value = applyCommand(before, { type: "update-config", config }, 20000, "host");
  assert.deepEqual(value.clock, before.clock);
  assert.deepEqual(value.roundHistory, before.roundHistory);
  value = applyCommand(value, { type: "resume" }, 30000, "host");
  value = applyCommand(value, { type: "end-turn" }, 31000, "negative");
  assert.equal(value.clock.affirmativeRemainingMs, 839000);
  assert.equal(value.clock.negativeRemainingMs, 609000);
  assert.equal(value.roundHistory[0].bonusSeconds, 10);
  assert.deepEqual(value.roundHistory[1], before.roundHistory[0]);
});

test("saving config does not refill an exhausted balance", () => {
  const before = room({ isRunning: false, affirmativeRemainingMs: 0, totalRemainingMs: 0 });
  const value = applyCommand(before, { type: "update-config", config: before.config }, 20000, "host");
  assert.deepEqual(value.clock, before.clock);
});
