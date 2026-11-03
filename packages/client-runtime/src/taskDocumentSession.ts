import type { OpenTaskDocument, SaveTaskDocumentInput } from "@t3tools/contracts";

export interface PersistedTaskDocumentDraft {
  readonly revision: string;
  readonly locatorVersion: number;
  readonly contents: string;
}

export interface TaskDocumentView<TEditorView> {
  readonly editor: TEditorView | null;
  readonly scrollTop: number;
  readonly rendered: boolean;
}

export interface TaskDocumentRecovery {
  readonly base: OpenTaskDocument;
  readonly draft: string;
  readonly disk: OpenTaskDocument;
  readonly keptDraft: boolean;
}

export interface TaskDocumentSessionState<TEditorView> {
  readonly base: OpenTaskDocument | null;
  readonly draft: string;
  readonly disk: OpenTaskDocument | null;
  readonly recovery: TaskDocumentRecovery | null;
  readonly error: string | null;
  readonly persistenceError: string | null;
  readonly saving: boolean;
  readonly view: TaskDocumentView<TEditorView>;
}

interface TaskDocumentSave {
  readonly generation: number;
  readonly input: SaveTaskDocumentInput;
}

export class TaskDocumentSession<TEditorView = unknown> {
  private generation = 0;
  private activeSave: TaskDocumentSave | null = null;
  private pendingPersistedDraft: PersistedTaskDocumentDraft | null;
  private persistedBase: Pick<PersistedTaskDocumentDraft, "revision" | "locatorVersion"> | null;
  private listeners = new Set<() => void>();
  private state: TaskDocumentSessionState<TEditorView> = {
    base: null,
    draft: "",
    disk: null,
    recovery: null,
    error: null,
    persistenceError: null,
    saving: false,
    view: { editor: null, scrollTop: 0, rendered: false },
  };

  constructor(persistedDraft: PersistedTaskDocumentDraft | null = null) {
    this.pendingPersistedDraft = persistedDraft;
    this.persistedBase = persistedDraft
      ? { revision: persistedDraft.revision, locatorVersion: persistedDraft.locatorVersion }
      : null;
  }

  getSnapshot = () => this.state;

  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  private update(change: Partial<TaskDocumentSessionState<TEditorView>>) {
    this.state = { ...this.state, ...change };
    for (const listener of this.listeners) listener();
  }

  beginRead() {
    return ++this.generation;
  }

  acceptRead(generation: number, document: OpenTaskDocument) {
    if (generation !== this.generation || this.activeSave !== null) return;
    const { base, draft } = this.state;
    if (base === null || draft === base.contents) {
      const pendingDraft = this.pendingPersistedDraft;
      this.pendingPersistedDraft = null;
      if (pendingDraft && pendingDraft.contents !== document.contents) {
        this.persistedBase = {
          revision: pendingDraft.revision,
          locatorVersion: pendingDraft.locatorVersion,
        };
        const diskChanged =
          pendingDraft.revision !== document.revision ||
          pendingDraft.locatorVersion !== document.summary.locatorVersion;
        this.update({
          base: document,
          draft: pendingDraft.contents,
          disk: diskChanged ? document : null,
          error: null,
        });
        return;
      }
      this.persistedBase = null;
      this.update({ base: document, draft: document.contents, disk: null, error: null });
    } else {
      this.update({
        disk:
          base.revision === document.revision &&
          base.summary.locatorVersion === document.summary.locatorVersion
            ? null
            : document,
        error: null,
      });
    }
  }

  failRead(generation: number, error: string) {
    if (generation === this.generation) this.update({ error });
  }

  edit(draft: string) {
    if (draft === this.state.base?.contents) this.persistedBase = null;
    this.update({ draft });
  }

  getPersistedDraft(): PersistedTaskDocumentDraft | null {
    const { base, draft } = this.state;
    if (base === null || draft === base.contents) return null;
    const metadata = this.persistedBase ?? {
      revision: base.revision,
      locatorVersion: base.summary.locatorVersion,
    };
    return { ...metadata, contents: draft };
  }

  setPersistenceError(error: string | null) {
    if (this.state.persistenceError !== error) this.update({ persistenceError: error });
  }

  restoreRecovery(
    recovery: Pick<PersistedTaskDocumentDraft, "revision" | "locatorVersion" | "contents">,
  ) {
    const { base } = this.state;
    if (base === null || this.activeSave !== null) return false;
    if (recovery.contents === base.contents) {
      this.persistedBase = null;
      this.update({ draft: base.contents, disk: null, error: null });
      return true;
    }
    this.persistedBase = { revision: recovery.revision, locatorVersion: recovery.locatorVersion };
    const diskChanged =
      recovery.revision !== base.revision ||
      recovery.locatorVersion !== base.summary.locatorVersion;
    this.update({ draft: recovery.contents, disk: diskChanged ? base : null, error: null });
    return true;
  }

  setView(view: Partial<TaskDocumentView<TEditorView>>) {
    this.update({ view: { ...this.state.view, ...view } });
  }

  beginSave(): TaskDocumentSave | null {
    const { base, disk, draft } = this.state;
    if (base === null || disk !== null || this.activeSave !== null || draft === base.contents) {
      return null;
    }
    const save = {
      generation: ++this.generation,
      input: {
        taskDocumentId: base.summary.taskDocumentId,
        locatorVersion: base.summary.locatorVersion,
        expectedRevision: base.revision,
        baseContents: base.contents,
        contents: draft,
      },
    };
    this.activeSave = save;
    this.update({ saving: true, error: null });
    return save;
  }

  acceptSave(save: TaskDocumentSave, document: OpenTaskDocument) {
    if (this.activeSave !== save) return;
    this.activeSave = null;
    ++this.generation;
    this.persistedBase =
      this.state.draft === save.input.contents
        ? null
        : { revision: document.revision, locatorVersion: document.summary.locatorVersion };
    this.update({
      base: document,
      draft: this.state.draft === save.input.contents ? document.contents : this.state.draft,
      disk: null,
      recovery: null,
      saving: false,
      error: null,
    });
  }

  failSave(save: TaskDocumentSave, error: string) {
    if (this.activeSave !== save) return;
    this.activeSave = null;
    ++this.generation;
    this.update({ saving: false, error });
  }

  private resolveDisk(keepDraft: boolean) {
    const { base, draft, disk } = this.state;
    if (base === null || disk === null || this.activeSave !== null) return;
    ++this.generation;
    this.persistedBase = keepDraft
      ? { revision: disk.revision, locatorVersion: disk.summary.locatorVersion }
      : null;
    this.update({
      recovery: { base, draft, disk, keptDraft: keepDraft },
      base: disk,
      draft: keepDraft ? draft : disk.contents,
      disk: null,
      error: null,
    });
  }

  keepDraft() {
    this.resolveDisk(true);
  }

  reloadDisk() {
    this.resolveDisk(false);
  }

  /** Undoes the choice made at the conflict: back to the discarded draft, or to the disk version. */
  reverseRecovery() {
    const { recovery } = this.state;
    if (recovery === null) return;
    this.update({
      draft: recovery.keptDraft ? recovery.disk.contents : recovery.draft,
      recovery: null,
    });
  }

  dismissRecovery() {
    this.update({ recovery: null });
  }
}
