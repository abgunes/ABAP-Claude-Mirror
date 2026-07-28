const vscode = require('vscode');
const fs = require('fs');
const path = require('path');
const os = require('os');

const MIRROR_ROOT = path.join(os.homedir(), '.claude-abap-mirror');
const mirrorToAbapUri = new Map();
// abap uris whose mirror the user closed on purpose — don't auto-reopen
// until the abap tab itself is closed and reopened fresh.
const manuallyClosedMirrors = new Set();
// abap uris that already got their one automatic reveal — after that,
// refocusing the abap tab must NOT steal focus back to the mirror; the
// user has to ask for it again via the "Open Mirrored File" command.
const autoRevealedMirrors = new Set();

function isEnabled() {
  return vscode.workspace.getConfiguration('abapClaudeMirror').get('enabled', true);
}

function sanitizeSegment(segment) {
  return segment.replace(/[<>:"|?*]/g, '_');
}

function mirrorPathFor(uri) {
  const segments = uri.path.split('/').filter(Boolean).map(sanitizeSegment);
  const leaf = segments.pop() || 'unnamed';
  // Nest mirrors under a folder tree matching the ABAP repository path, so
  // the leaf filename can stay short and readable (shown as the tab title)
  // while still being unique on disk.
  const dir = path.join(MIRROR_ROOT, ...segments);
  // Always end in .abapmirror — a private extension this same package owns
  // a grammar for (see syntaxes/abap-mirror.tmLanguage.json), giving
  // ABAP-like coloring without ever matching ADT's own *.prog.abap /
  // *.ddls.acds / etc. registrations. Matching one of those would hand the
  // mirror to ADT's language server/Joule completion, which fails trying
  // to resolve an ABAP project for a path that isn't part of any real one.
  const rawPath = path.join(dir, `abapClaudeMirror - ${leaf}.abapmirror`);
  // Route through vscode.Uri so the result matches VS Code's own drive-letter
  // casing/normalization — otherwise this string won't equal the fsPath VS
  // Code reports back from tabs, visibleTextEditors, or the file watcher,
  // and every comparison against it silently fails on Windows.
  return vscode.Uri.file(rawPath).fsPath;
}

function writeMirrorIfChanged(mirrorPath, content) {
  let existing = null;
  try {
    existing = fs.readFileSync(mirrorPath, 'utf8');
  } catch (e) {
    // mirror doesn't exist yet
  }
  if (existing === content) return;
  const dir = path.dirname(mirrorPath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(mirrorPath, content, 'utf8');
}

async function pushMirrorChangeToAbap(mirrorPath) {
  if (!isEnabled()) return;
  const abapUriString = mirrorToAbapUri.get(mirrorPath);
  if (!abapUriString) return;

  const abapDoc = vscode.workspace.textDocuments.find(d => d.uri.toString() === abapUriString);
  if (!abapDoc) {
    vscode.window.showWarningMessage(
      'ABAP Claude Mirror: source tab is closed, could not sync change back to ' + abapUriString
    );
    return;
  }

  const newContent = fs.readFileSync(mirrorPath, 'utf8');
  if (abapDoc.getText() === newContent) return;

  const fullRange = new vscode.Range(
    abapDoc.positionAt(0),
    abapDoc.positionAt(abapDoc.getText().length)
  );
  const edit = new vscode.WorkspaceEdit();
  edit.replace(abapDoc.uri, fullRange, newContent);
  await vscode.workspace.applyEdit(edit);
}

async function closeMirrorEditor(mirrorPath) {
  const mirrorUriString = vscode.Uri.file(mirrorPath).toString();
  for (const group of vscode.window.tabGroups.all) {
    for (const tab of group.tabs) {
      if (tab.input instanceof vscode.TabInputText && tab.input.uri.toString() === mirrorUriString) {
        await vscode.window.tabGroups.close(tab);
      }
    }
  }
}

async function revealMirror(doc, { force = false } = {}) {
  const mirrorPath = mirrorPathFor(doc.uri);
  mirrorToAbapUri.set(mirrorPath, doc.uri.toString());
  writeMirrorIfChanged(mirrorPath, doc.getText());

  const isMirrorVisible = vscode.window.visibleTextEditors.some(
    e => e.document.uri.fsPath === mirrorPath
  );
  // Only reveal+focus when the mirror isn't already open somewhere — this
  // must NOT depend on "which abap uri was last revealed", or toggling
  // between two different ABAP tabs makes each look "new" again and
  // steals focus back every time you click the original tab.
  if (isMirrorVisible && !force) return;

  const mirrorUri = vscode.Uri.file(mirrorPath);
  const mirrorDoc = await vscode.workspace.openTextDocument(mirrorUri);
  await vscode.window.showTextDocument(mirrorDoc, {
    viewColumn: vscode.ViewColumn.Beside,
    preview: true,
    preserveFocus: false
  });
}

async function handleActiveEditorChange(editor) {
  if (!editor || !isEnabled()) return;
  const doc = editor.document;
  if (doc.uri.scheme !== 'abap') return;

  const uriString = doc.uri.toString();
  const mirrorPath = mirrorPathFor(doc.uri);
  mirrorToAbapUri.set(mirrorPath, uriString);
  writeMirrorIfChanged(mirrorPath, doc.getText());

  // Respect a manual close of the mirror tab — don't force it back open
  // just because you clicked back onto the original ABAP tab.
  if (manuallyClosedMirrors.has(uriString)) return;

  // Only auto-reveal the very first time this ABAP doc becomes active in
  // this session. Every later refocus (e.g. clicking away and back) must
  // leave the mirror alone — reopening it on demand is what the
  // "Open Mirrored File (Claude)" command/context-menu entry is for.
  if (autoRevealedMirrors.has(uriString)) return;
  autoRevealedMirrors.add(uriString);

  await revealMirror(doc);
}

async function openMirrorCommand(uriArg) {
  if (!isEnabled()) {
    vscode.window.showWarningMessage('ABAP Claude Mirror is disabled (abapClaudeMirror.enabled).');
    return;
  }

  let uri = uriArg instanceof vscode.Uri ? uriArg : undefined;
  if (!uri && vscode.window.activeTextEditor) {
    uri = vscode.window.activeTextEditor.document.uri;
  }
  if (!uri || uri.scheme !== 'abap') {
    vscode.window.showWarningMessage('ABAP Claude Mirror: pick an open ABAP (abap://) document first.');
    return;
  }

  const uriString = uri.toString();
  let doc = vscode.workspace.textDocuments.find(d => d.uri.toString() === uriString);
  if (!doc) doc = await vscode.workspace.openTextDocument(uri);

  // An explicit ask to open always wins over a prior manual close, and
  // counts as this doc's "already revealed" moment too.
  manuallyClosedMirrors.delete(uriString);
  autoRevealedMirrors.add(uriString);

  await revealMirror(doc, { force: true });
}

function activate(context) {
  if (!fs.existsSync(MIRROR_ROOT)) fs.mkdirSync(MIRROR_ROOT, { recursive: true });

  context.subscriptions.push(vscode.window.onDidChangeActiveTextEditor(handleActiveEditorChange));
  context.subscriptions.push(vscode.commands.registerCommand('abapClaudeMirror.openMirror', openMirrorCommand));

  context.subscriptions.push(vscode.workspace.onDidChangeTextDocument(e => {
    if (isEnabled() && e.document.uri.scheme === 'abap') {
      const mirrorPath = mirrorPathFor(e.document.uri);
      mirrorToAbapUri.set(mirrorPath, e.document.uri.toString());
      writeMirrorIfChanged(mirrorPath, e.document.getText());
    }
  }));

  context.subscriptions.push(vscode.workspace.onDidCloseTextDocument(doc => {
    if (!isEnabled()) return;

    if (doc.uri.scheme === 'abap') {
      // Original ABAP tab closed — close its mirror too and forget any
      // manual-close/auto-revealed state, so reopening the object later
      // reveals fresh.
      const mirrorPath = mirrorPathFor(doc.uri);
      mirrorToAbapUri.delete(mirrorPath);
      manuallyClosedMirrors.delete(doc.uri.toString());
      autoRevealedMirrors.delete(doc.uri.toString());
      closeMirrorEditor(mirrorPath);
      return;
    }

    if (doc.uri.scheme === 'file') {
      // A mirror tab closed while its ABAP source is still open — that's
      // a deliberate user action, remember it so we don't snap it back
      // open the next time the ABAP tab regains focus.
      const abapUriString = mirrorToAbapUri.get(doc.uri.fsPath);
      if (abapUriString) manuallyClosedMirrors.add(abapUriString);
    }
  }));

  const watcher = vscode.workspace.createFileSystemWatcher(
    new vscode.RelativePattern(MIRROR_ROOT, '**/*')
  );
  context.subscriptions.push(watcher);
  context.subscriptions.push(watcher.onDidChange(uri => pushMirrorChangeToAbap(uri.fsPath)));

  if (vscode.window.activeTextEditor) {
    handleActiveEditorChange(vscode.window.activeTextEditor);
  }
}

function deactivate() {}

module.exports = { activate, deactivate };
