import { describe, expect, it } from "vite-plus/test";
import { CommandId, TaskDocumentId } from "@t3tools/contracts";

import { cn, taskChangeRetryIdentity } from "./utils";

describe("cn", () => {
  it("keeps a background color next to a composer seam background image", () => {
    expect(cn("dark:before:bg-transparent dark:before:bg-composer-seam-below")).toBe(
      "dark:before:bg-transparent dark:before:bg-composer-seam-below",
    );
  });
});

describe("taskChangeRetryIdentity", () => {
  it("rotates identity only after a rejected task-work command and a task change", () => {
    const currentTask = TaskDocumentId.make("11111111-1111-4111-8111-111111111111");
    const nextTask = TaskDocumentId.make("22222222-2222-4222-8222-222222222222");
    const workCommand = CommandId.make("thread-task-work:rejected");

    const retry = taskChangeRetryIdentity(currentTask, workCommand, nextTask);

    expect(retry?.threadId).toBeDefined();
    expect(retry?.threadId).not.toBe("thread:old");
    expect(retry?.taskWorkCommandId).toBeNull();
    expect(taskChangeRetryIdentity(currentTask, workCommand, currentTask)).toBeUndefined();
    expect(taskChangeRetryIdentity(currentTask, null, nextTask)).toBeUndefined();
  });
});
