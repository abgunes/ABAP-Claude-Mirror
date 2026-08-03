// mirrorTreeProvider.js
const vscode = require('vscode');
const { buildMirrorTree, folderContainsChanged } = require('./mirrorTree');

class MirrorTreeDataProvider {
  constructor(mirrorRoot, syncStateStore) {
    this.mirrorRoot = mirrorRoot;
    this.syncStateStore = syncStateStore;
    this._onDidChangeTreeData = new vscode.EventEmitter();
    this.onDidChangeTreeData = this._onDidChangeTreeData.event;
    this._tree = null;

    syncStateStore.onDidChange(() => this.refresh());
    this.refresh();
  }

  refresh() {
    this._tree = buildMirrorTree(this.mirrorRoot, this.syncStateStore.entries());
    this._onDidChangeTreeData.fire(undefined);
  }

  getChildren(element) {
    const node = element || this._tree;
    if (!node || node.type !== 'folder') return [];
    return Array.from(node.children.values()).sort((a, b) => {
      if (a.type !== b.type) return a.type === 'folder' ? -1 : 1;
      return a.name.localeCompare(b.name);
    });
  }

  getTreeItem(node) {
    if (node.type === 'folder') {
      const collapsibleState = folderContainsChanged(node)
        ? vscode.TreeItemCollapsibleState.Expanded
        : vscode.TreeItemCollapsibleState.Collapsed;
      const item = new vscode.TreeItem(node.name, collapsibleState);
      item.resourceUri = vscode.Uri.file(node.fullPath);
      item.contextValue = 'abapMirrorFolder';
      return item;
    }

    const item = new vscode.TreeItem(node.name, vscode.TreeItemCollapsibleState.None);
    item.resourceUri = vscode.Uri.file(node.fullPath);
    item.contextValue = 'abapMirrorObject';
    item.command = {
      command: 'vscode.open',
      title: 'Open Mirror File',
      arguments: [vscode.Uri.file(node.fullPath)],
    };
    return item;
  }
}

class MirrorDecorationProvider {
  constructor(syncStateStore) {
    this.syncStateStore = syncStateStore;
    this._onDidChangeFileDecorations = new vscode.EventEmitter();
    this.onDidChangeFileDecorations = this._onDidChangeFileDecorations.event;

    syncStateStore.onDidChange(() => this._onDidChangeFileDecorations.fire(undefined));
  }

  provideFileDecoration(uri) {
    const state = this.syncStateStore.get(uri.fsPath);
    if (state === 'changed') {
      return { color: new vscode.ThemeColor('charts.red'), tooltip: 'Unsaved changes pending in ADT' };
    }
    if (state === 'synced') {
      return { color: new vscode.ThemeColor('charts.blue'), tooltip: 'Synced with ADT' };
    }
    return undefined;
  }
}

module.exports = { MirrorTreeDataProvider, MirrorDecorationProvider };
