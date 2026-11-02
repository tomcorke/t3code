import type { EnvironmentThreadShell } from "@t3tools/client-runtime/state/shell";
import type { TaskDocumentId } from "@t3tools/contracts";

export type TaskThreadAttention = "needs-approval" | "failed" | "running" | "idle";

export type TaskMemberThread = Pick<
  EnvironmentThreadShell,
  "taskDocumentId" | "hasPendingApprovals" | "pendingSubagentRequest"
> & {
  readonly runtime: Pick<NonNullable<EnvironmentThreadShell["runtime"]>, "status"> | null;
};

const attentionPriority: Record<TaskThreadAttention, number> = {
  idle: 0,
  running: 1,
  failed: 2,
  "needs-approval": 3,
};

function threadAttention(thread: TaskMemberThread): TaskThreadAttention {
  if (thread.hasPendingApprovals || thread.pendingSubagentRequest === "approval") {
    return "needs-approval";
  }
  if (thread.runtime?.status === "failed") return "failed";
  if (
    thread.runtime?.status === "preparing" ||
    thread.runtime?.status === "queued" ||
    thread.runtime?.status === "starting" ||
    thread.runtime?.status === "running" ||
    thread.runtime?.status === "waiting"
  ) {
    return "running";
  }
  return "idle";
}

export function taskThreadAttentionByDocumentId(
  threads: ReadonlyArray<TaskMemberThread>,
): ReadonlyMap<TaskDocumentId, TaskThreadAttention> {
  const attentionByTask = new Map<TaskDocumentId, TaskThreadAttention>();
  for (const thread of threads) {
    const taskDocumentId = thread.taskDocumentId;
    if (taskDocumentId == null) continue;
    const attention = threadAttention(thread);
    const previous = attentionByTask.get(taskDocumentId);
    if (previous === undefined || attentionPriority[attention] > attentionPriority[previous]) {
      attentionByTask.set(taskDocumentId, attention);
    }
  }
  return attentionByTask;
}
