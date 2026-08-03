const DEFAULT_CONFIRM_THRESHOLD = 200;
const DEFAULT_READ_CONCURRENCY = 5;

async function collectLeaves(fsLike, directoryFileType, rootUri, joinChild) {
  const leaves = [];

  async function walk(uri) {
    const entries = await fsLike.readDirectory(uri);
    for (const [name, type] of entries) {
      const childUri = joinChild(uri, name);
      if (type === directoryFileType) {
        await walk(childUri);
      } else {
        leaves.push(childUri);
      }
    }
  }

  await walk(rootUri);
  return leaves;
}

function shouldConfirm(count, threshold = DEFAULT_CONFIRM_THRESHOLD) {
  return count > threshold;
}

async function runWithConcurrency(items, worker, { concurrency = DEFAULT_READ_CONCURRENCY, isCancelled = () => false } = {}) {
  let index = 0;

  async function next() {
    while (index < items.length) {
      if (isCancelled()) return;
      const i = index++;
      await worker(items[i], i);
    }
  }

  const runners = [];
  for (let i = 0; i < Math.min(concurrency, items.length); i++) runners.push(next());
  await Promise.all(runners);
}

module.exports = {
  DEFAULT_CONFIRM_THRESHOLD,
  DEFAULT_READ_CONCURRENCY,
  collectLeaves,
  shouldConfirm,
  runWithConcurrency,
};
