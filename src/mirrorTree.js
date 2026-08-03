// mirrorTree.js
const path = require('node:path');

function buildMirrorTree(rootPath, entries) {
  const root = { type: 'folder', name: path.basename(rootPath), fullPath: rootPath, children: new Map() };

  for (const { mirrorPath, state } of entries) {
    const rel = path.relative(rootPath, mirrorPath);
    const segments = rel.split(path.sep).filter(Boolean);
    let node = root;
    let currentPath = rootPath;

    segments.forEach((segment, i) => {
      currentPath = path.join(currentPath, segment);
      const isLeaf = i === segments.length - 1;

      if (isLeaf) {
        node.children.set(segment, { type: 'object', name: segment, fullPath: currentPath, state });
        return;
      }

      if (!node.children.has(segment)) {
        node.children.set(segment, { type: 'folder', name: segment, fullPath: currentPath, children: new Map() });
      }
      node = node.children.get(segment);
    });
  }

  return root;
}

function folderContainsChanged(folderNode) {
  for (const child of folderNode.children.values()) {
    if (child.type === 'object') {
      if (child.state === 'changed') return true;
    } else if (folderContainsChanged(child)) {
      return true;
    }
  }
  return false;
}

module.exports = { buildMirrorTree, folderContainsChanged };
