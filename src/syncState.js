const { EventEmitter } = require('node:events');

function createSyncStateStore() {
  const state = new Map();
  const emitter = new EventEmitter();

  return {
    register(mirrorPath) {
      if (!state.has(mirrorPath)) {
        state.set(mirrorPath, 'synced');
        emitter.emit('change');
      }
    },
    markChanged(mirrorPath) {
      if (state.get(mirrorPath) !== 'changed') {
        state.set(mirrorPath, 'changed');
        emitter.emit('change');
      }
    },
    markSynced(mirrorPath) {
      if (state.get(mirrorPath) !== 'synced') {
        state.set(mirrorPath, 'synced');
        emitter.emit('change');
      }
    },
    get(mirrorPath) {
      return state.get(mirrorPath);
    },
    entries() {
      return Array.from(state.entries()).map(([mirrorPath, s]) => ({ mirrorPath, state: s }));
    },
    onDidChange(listener) {
      emitter.on('change', listener);
      return { dispose: () => emitter.off('change', listener) };
    },
  };
}

module.exports = { createSyncStateStore };
