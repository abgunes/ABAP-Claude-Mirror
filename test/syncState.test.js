const test = require('node:test');
const assert = require('node:assert/strict');
const { createSyncStateStore } = require('../syncState');

test('register sets a new mirror path to synced', () => {
  const store = createSyncStateStore();
  store.register('/mirror/a.abapmirror');
  assert.equal(store.get('/mirror/a.abapmirror'), 'synced');
});

test('register does not overwrite an existing entry', () => {
  const store = createSyncStateStore();
  store.register('/mirror/a.abapmirror');
  store.markChanged('/mirror/a.abapmirror');
  store.register('/mirror/a.abapmirror');
  assert.equal(store.get('/mirror/a.abapmirror'), 'changed');
});

test('markChanged then markSynced transitions correctly', () => {
  const store = createSyncStateStore();
  store.register('/mirror/a.abapmirror');
  store.markChanged('/mirror/a.abapmirror');
  assert.equal(store.get('/mirror/a.abapmirror'), 'changed');
  store.markSynced('/mirror/a.abapmirror');
  assert.equal(store.get('/mirror/a.abapmirror'), 'synced');
});

test('entries lists every tracked mirror path with its state', () => {
  const store = createSyncStateStore();
  store.register('/mirror/a.abapmirror');
  store.register('/mirror/b.abapmirror');
  store.markChanged('/mirror/b.abapmirror');

  const entries = store.entries().sort((x, y) => x.mirrorPath.localeCompare(y.mirrorPath));
  assert.deepEqual(entries, [
    { mirrorPath: '/mirror/a.abapmirror', state: 'synced' },
    { mirrorPath: '/mirror/b.abapmirror', state: 'changed' },
  ]);
});

test('onDidChange fires once per actual state transition, not on no-op calls', () => {
  const store = createSyncStateStore();
  let fireCount = 0;
  store.onDidChange(() => {
    fireCount++;
  });

  store.register('/mirror/a.abapmirror');
  store.markSynced('/mirror/a.abapmirror');
  store.markChanged('/mirror/a.abapmirror');
  store.markChanged('/mirror/a.abapmirror');

  assert.equal(fireCount, 2);
});
