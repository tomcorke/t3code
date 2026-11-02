import { describe, expect, it } from "vite-plus/test";
import { TaskDocumentId } from "@t3tools/contracts";

import { cn, taskChangeRetryIdentity } from "./utils";

describe("cn", () => {
  it("keeps a background color next to a composer seam background image", () => {
    expect(cn("dark:before:bg-transparent dark:before:bg-composer-seam-below")).toBe(
      "dark:before:bg-transparent dark:before:bg-composer-seam-below",
    );
  });
});

describe("taskChangeRetryIdentity", () => {
  it("rotates identity when the selected task changes", () => {
    const currentTask = TaskDocumentId.make("11111111-1111-4111-8111-111111111111");
    const nextTask = TaskDocumentId.make("22222222-2222-4222-8222-222222222222");

    const retry = taskChangeRetryIdentity(currentTask, nextTask);

    expect(retry?.threadId).toBeDefined();
    expect(retry?.threadId).not.toBe("thread:old");
    expect(retry?.taskWorkCommandId).toBeNull();
    expect(taskChangeRetryIdentity(currentTask, currentTask)).toBeUndefined();
    expect(taskChangeRetryIdentity(null, nextTask)?.threadId).toBeDefined();
  });
});
