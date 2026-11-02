import { TaskDocumentId } from "@t3tools/contracts";
import { describe, expect, it } from "vite-plus/test";

import { taskThreadAttentionByDocumentId, type TaskMemberThread } from "./taskThreadAttention";

const taskDocumentId = TaskDocumentId.make("11111111-1111-4111-8111-111111111111");

function thread(overrides: Partial<TaskMemberThread> = {}): TaskMemberThread {
  return {
    taskDocumentId,
    hasPendingApprovals: false,
    pendingSubagentRequest: null,
    runtime: null,
    ...overrides,
  };
}

describe("taskThreadAttentionByDocumentId", () => {
  it("summarizes only associated threads and defaults members to idle", () => {
    expect(
      taskThreadAttentionByDocumentId([
        thread(),
        thread({ taskDocumentId: null }),
        thread({ taskDocumentId: undefined }),
      ]),
    ).toEqual(new Map([[taskDocumentId, "idle"]]));
  });

  it("chooses needs approval before failure and running", () => {
    expect(
      taskThreadAttentionByDocumentId([
        thread({ runtime: { status: "running" } }),
        thread({ runtime: { status: "failed" } }),
        thread({ hasPendingApprovals: true }),
      ]).get(taskDocumentId),
    ).toBe("needs-approval");
    expect(
      taskThreadAttentionByDocumentId([
        thread({ runtime: { status: "running" } }),
        thread({ runtime: { status: "failed" } }),
      ]).get(taskDocumentId),
    ).toBe("failed");
  });

  it("counts delegated approvals and live waiting work", () => {
    expect(
      taskThreadAttentionByDocumentId([
        thread({ pendingSubagentRequest: "approval" }),
        thread({ runtime: { status: "waiting" } }),
      ]).get(taskDocumentId),
    ).toBe("needs-approval");
    expect(
      taskThreadAttentionByDocumentId([thread({ runtime: { status: "waiting" } })]).get(
        taskDocumentId,
      ),
    ).toBe("running");
  });
});
