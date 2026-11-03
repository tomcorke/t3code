import { useAtomValue } from "@effect/atom-react";
import { squashAtomCommandFailure } from "@t3tools/client-runtime/state/runtime";
import { TaskDocumentSession } from "@t3tools/client-runtime/task-document-session";
import {
  TaskDocumentConflict,
  type EnvironmentId,
  type TaskDocumentRecovery,
  type TaskDocumentRecoveryRef,
  type TaskDocumentId,
  type TaskDocumentSummary,
} from "@t3tools/contracts";
import type { EditorViewState } from "@pierre/diffs/edit";
import * as Schema from "effect/Schema";
import { useEffect, useEffectEvent, useState, useSyncExternalStore } from "react";

import { environmentCatalog } from "~/connection/catalog";
import { useEnvironmentQuery } from "~/state/query";
import { useServerConfigs } from "~/state/entities";
import {
  readTaskDocumentDraft,
  removeTaskDocumentDraft,
  taskDocumentEnvironment,
  writeTaskDocumentDraft,
} from "~/state/taskDocuments";
import { useAtomCommand } from "~/state/use-atom-command";

const isTaskDocumentConflict = Schema.is(TaskDocumentConflict);
const EMPTY_TASKS: ReadonlyArray<TaskDocumentSummary> = [];
const EMPTY_RECOVERY_RECORDS: ReadonlyArray<TaskDocumentRecoveryRef> = [];

export function useTaskCatalogue(environmentId: EnvironmentId) {
  const supported =
    useServerConfigs().get(environmentId)?.environment.capabilities.taskDocuments === true;
  const canRead = useAtomValue(taskDocumentEnvironment.list.permissionAtom(environmentId));
  const canRegister = useAtomValue(taskDocumentEnvironment.register.permissionAtom(environmentId));
  const canCreate = useAtomValue(taskDocumentEnvironment.create.permissionAtom(environmentId));
  const canRelink = useAtomValue(taskDocumentEnvironment.relink.permissionAtom(environmentId));
  const available = supported && canRead;
  const { data: revision } = useEnvironmentQuery(
    available ? taskDocumentEnvironment.catalogueChanges({ environmentId, input: {} }) : null,
  );
  // The notice stream cannot report what changed while disconnected.
  const sessionGeneration = useAtomValue(environmentCatalog.sessionGenerationAtom(environmentId));
  const list = useAtomCommand(taskDocumentEnvironment.list, { reportFailure: false });
  const [catalogue, setCatalogue] = useState({ environmentId, tasks: EMPTY_TASKS });
  const fetchTasks = useEffectEvent((target: EnvironmentId) =>
    list({ environmentId: target, input: {} }),
  );
  // oxlint-disable-next-line t3code/no-unreasoned-state-sync -- refetches the server's catalogue each time its notice stream reports a change
  useEffect(() => {
    if (revision === null || sessionGeneration === 0) return;
    let current = true;
    void fetchTasks(environmentId).then((result) => {
      if (current && result._tag === "Success")
        setCatalogue({ environmentId, tasks: result.value });
    });
    return () => {
      current = false;
    };
  }, [environmentId, revision, sessionGeneration]);
  return {
    available,
    canRegister: available && canRegister,
    canCreate: available && canCreate,
    canRelink: available && canRelink,
    tasks: available && catalogue.environmentId === environmentId ? catalogue.tasks : EMPTY_TASKS,
  };
}

export type TaskSession = TaskDocumentSession<EditorViewState>;
// Outlives every pane and thread: drafts belong to (environment, task), not to whatever shows them.
const sessions = new Map<string, TaskSession>();

function taskDocumentSession(environmentId: EnvironmentId, taskDocumentId: TaskDocumentId) {
  const key = `${environmentId}:${taskDocumentId}`;
  let session = sessions.get(key);
  if (!session) {
    session = new TaskDocumentSession<EditorViewState>(
      readTaskDocumentDraft(environmentId, taskDocumentId),
    );
    sessions.set(key, session);
  }
  return session;
}

function persistTaskDocumentDraft(
  environmentId: EnvironmentId,
  taskDocumentId: TaskDocumentId,
  session: TaskDocumentSession<EditorViewState>,
) {
  try {
    const persistedDraft = session.getPersistedDraft();
    if (persistedDraft === null) removeTaskDocumentDraft(environmentId, taskDocumentId);
    else writeTaskDocumentDraft(environmentId, taskDocumentId, persistedDraft);
    session.setPersistenceError(null);
  } catch {
    session.setPersistenceError("This browser could not save a local recovery copy.");
  }
}

export function useTaskDocument(environmentId: EnvironmentId, taskDocumentId: TaskDocumentId) {
  const supported =
    useServerConfigs().get(environmentId)?.environment.capabilities.taskDocuments === true;
  const session = taskDocumentSession(environmentId, taskDocumentId);
  const state = useSyncExternalStore(session.subscribe, session.getSnapshot);
  const readGranted = useAtomValue(taskDocumentEnvironment.open.permissionAtom(environmentId));
  const saveGranted = useAtomValue(taskDocumentEnvironment.save.permissionAtom(environmentId));
  const listRecoveryGranted = useAtomValue(
    taskDocumentEnvironment.listRecovery.permissionAtom(environmentId),
  );
  const readRecoveryGranted = useAtomValue(
    taskDocumentEnvironment.readRecovery.permissionAtom(environmentId),
  );
  const canRead = supported && readGranted;
  const canSave = canRead && saveGranted;
  const canRecover = canRead && listRecoveryGranted && readRecoveryGranted;
  const query = useEnvironmentQuery(
    canRead
      ? taskDocumentEnvironment.documentChanges({ environmentId, input: { taskDocumentId } })
      : null,
  );
  const saveCommand = useAtomCommand(taskDocumentEnvironment.save, { reportFailure: false });
  const openCommand = useAtomCommand(taskDocumentEnvironment.open, { reportFailure: false });
  const listRecoveryCommand = useAtomCommand(taskDocumentEnvironment.listRecovery, {
    reportFailure: false,
  });
  const recoveryKey = `${environmentId}:${taskDocumentId}`;
  const hasBaseDocument = state.base !== null;
  const recoveryRevision = state.base?.revision ?? null;
  const recoveryLocatorVersion = state.base?.summary.locatorVersion ?? null;
  const [recoveryState, setRecoveryState] = useState<{
    key: string;
    records: ReadonlyArray<TaskDocumentRecoveryRef>;
    error: string | null;
  }>({ key: recoveryKey, records: [], error: null });
  const sessionGeneration = useAtomValue(environmentCatalog.sessionGenerationAtom(environmentId));

  // oxlint-disable-next-line t3code/no-unreasoned-state-sync -- feeds the server's document stream into the session that outlives this component
  useEffect(() => {
    if (query.data !== null) session.acceptRead(session.beginRead(), query.data);
  }, [session, query.data]);
  // oxlint-disable-next-line t3code/no-unreasoned-state-sync -- feeds the server's document stream failures into the session that outlives this component
  useEffect(() => {
    if (query.error !== null) session.failRead(session.beginRead(), query.error);
  }, [session, query.error]);

  // oxlint-disable-next-line t3code/no-unreasoned-state-sync -- persists dirty content and its base revision outside the page lifetime
  useEffect(() => {
    if (!hasBaseDocument) return;
    const timeout = setTimeout(() => {
      const snapshot = session.getSnapshot();
      if (
        state.draft === snapshot.draft &&
        recoveryRevision === (snapshot.base?.revision ?? null) &&
        recoveryLocatorVersion === (snapshot.base?.summary.locatorVersion ?? null)
      ) {
        persistTaskDocumentDraft(environmentId, taskDocumentId, session);
      }
    }, 250);
    return () => clearTimeout(timeout);
  }, [
    environmentId,
    hasBaseDocument,
    recoveryLocatorVersion,
    recoveryRevision,
    session,
    state.draft,
    taskDocumentId,
  ]);

  // oxlint-disable-next-line t3code/no-unreasoned-state-sync -- flushes the active task draft when its pane leaves the page
  useEffect(() => {
    if (!hasBaseDocument) return;
    const onPageHide = () => persistTaskDocumentDraft(environmentId, taskDocumentId, session);
    window.addEventListener("pagehide", onPageHide);
    return () => {
      window.removeEventListener("pagehide", onPageHide);
      persistTaskDocumentDraft(environmentId, taskDocumentId, session);
    };
  }, [environmentId, hasBaseDocument, session, taskDocumentId]);

  const fetchRecoveryRecords = useEffectEvent(async (target: EnvironmentId) =>
    listRecoveryCommand({ environmentId: target, input: { taskDocumentId } }),
  );
  const refreshRecoveryRecords = async () => {
    const result = await listRecoveryCommand({ environmentId, input: { taskDocumentId } });
    if (result._tag === "Success") {
      setRecoveryState({ key: recoveryKey, records: result.value, error: null });
    } else {
      setRecoveryState({
        key: recoveryKey,
        records: [],
        error: "Server recovery copies could not be loaded. Reload this task to try again.",
      });
    }
  };
  // oxlint-disable-next-line t3code/no-unreasoned-state-sync -- lists persisted server recovery records for the open task
  useEffect(() => {
    if (
      !canRecover ||
      recoveryRevision === null ||
      recoveryLocatorVersion === null ||
      sessionGeneration === 0
    )
      return;
    let current = true;
    void fetchRecoveryRecords(environmentId).then((result) => {
      if (!current) return;
      if (result._tag === "Success") {
        setRecoveryState({ key: recoveryKey, records: result.value, error: null });
      } else {
        setRecoveryState({
          key: recoveryKey,
          records: [],
          error: "Server recovery copies could not be loaded. Reload this task to try again.",
        });
      }
    });
    return () => {
      current = false;
    };
  }, [
    canRecover,
    environmentId,
    recoveryKey,
    recoveryLocatorVersion,
    recoveryRevision,
    sessionGeneration,
  ]);

  const save = async () => {
    if (!canSave) return;
    const ticket = session.beginSave();
    if (ticket === null) return;
    const result = await saveCommand({ environmentId, input: ticket.input });
    if (result._tag === "Success") {
      session.acceptSave(ticket, result.value);
    } else {
      const failure = squashAtomCommandFailure(result);
      session.failSave(ticket, failure instanceof Error ? failure.message : "Could not save.");
      void refreshRecoveryRecords();
      if (!isTaskDocumentConflict(failure)) return;
    }
    // A document notice may arrive during the write, when the session cannot apply it.
    const read = session.beginRead();
    const opened = await openCommand({ environmentId, input: { taskDocumentId } });
    if (opened._tag === "Success") session.acceptRead(read, opened.value);
    else session.failRead(read, "The disk version could not be reloaded.");
  };

  const restoreRecovery = (recovery: TaskDocumentRecovery) => {
    if (!canRecover) return false;
    return session.restoreRecovery({
      revision: recovery.expectedRevision,
      locatorVersion: recovery.locatorVersion,
      contents: recovery.contents,
    });
  };

  return {
    session,
    state,
    supported,
    canRead,
    canSave,
    canRecover,
    recoveryRecords:
      recoveryState.key === recoveryKey ? recoveryState.records : EMPTY_RECOVERY_RECORDS,
    recoveryError: recoveryState.key === recoveryKey ? recoveryState.error : null,
    restoreRecovery,
    save,
  };
}
