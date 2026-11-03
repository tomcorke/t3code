import { createTaskDocumentEnvironmentAtoms } from "@t3tools/client-runtime/state/task-documents";
import type { PersistedTaskDocumentDraft } from "@t3tools/client-runtime/task-document-session";
import { TaskDocumentId, TASK_DOCUMENT_MAX_BYTES } from "@t3tools/contracts";
import * as Schema from "effect/Schema";
import type { EnvironmentId } from "@t3tools/contracts";

import { connectionAtomRuntime } from "../connection/runtime";
import {
  getLocalStorageItem,
  removeLocalStorageItem,
  setLocalStorageItem,
} from "../hooks/useLocalStorage";

export const taskDocumentEnvironment = createTaskDocumentEnvironmentAtoms(connectionAtomRuntime);

const TaskDocumentDraft = Schema.Struct({
  revision: Schema.String.check(Schema.isPattern(/^[a-f0-9]{64}$/)),
  locatorVersion: Schema.Number.check(Schema.isInt(), Schema.isGreaterThanOrEqualTo(0)),
  contents: Schema.String.check(Schema.isMaxLength(TASK_DOCUMENT_MAX_BYTES)),
});

const taskDocumentDraftKey = (environmentId: EnvironmentId, taskDocumentId: TaskDocumentId) =>
  `t3code:task-document-draft:v1:${environmentId}:${taskDocumentId}`;

export const readTaskDocumentDraft = (
  environmentId: EnvironmentId,
  taskDocumentId: TaskDocumentId,
): PersistedTaskDocumentDraft | null => {
  const key = taskDocumentDraftKey(environmentId, taskDocumentId);
  try {
    return getLocalStorageItem(key, TaskDocumentDraft);
  } catch {
    try {
      removeLocalStorageItem(key);
    } catch {
      // Ignore malformed or inaccessible browser storage; the editor still opens from disk.
    }
    return null;
  }
};

export const writeTaskDocumentDraft = (
  environmentId: EnvironmentId,
  taskDocumentId: TaskDocumentId,
  draft: PersistedTaskDocumentDraft,
) =>
  setLocalStorageItem(
    taskDocumentDraftKey(environmentId, taskDocumentId),
    draft,
    TaskDocumentDraft,
  );

export const removeTaskDocumentDraft = (
  environmentId: EnvironmentId,
  taskDocumentId: TaskDocumentId,
) => removeLocalStorageItem(taskDocumentDraftKey(environmentId, taskDocumentId));

const updateInstructionsKey = (environmentId: EnvironmentId) =>
  `t3code:task-update-instructions:${environmentId}`;

/** A path on the environment's own machine, so each environment remembers its own. */
export const readTaskUpdateInstructionsPath = (environmentId: EnvironmentId) =>
  getLocalStorageItem(updateInstructionsKey(environmentId), Schema.String)?.trim() || null;

export const writeTaskUpdateInstructionsPath = (environmentId: EnvironmentId, path: string) =>
  setLocalStorageItem(updateInstructionsKey(environmentId), path.trim(), Schema.String);

const legacyTaskFolderKey = (environmentId: EnvironmentId) => `t3code:task-folder:${environmentId}`;

/** Read only to carry an existing browser preference into the server setting. */
export const readLegacyTaskFolder = (environmentId: EnvironmentId) =>
  getLocalStorageItem(legacyTaskFolderKey(environmentId), Schema.String)?.trim() || null;

/** Retire the browser preference once its value has been saved to the environment. */
export const removeLegacyTaskFolder = (environmentId: EnvironmentId) =>
  removeLocalStorageItem(legacyTaskFolderKey(environmentId));
