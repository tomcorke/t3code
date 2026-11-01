import {
  CommandId,
  OrchestrationV2DispatchCommandError,
  OrchestrationV2ThreadLaunchError,
  ProjectId,
} from "@t3tools/contracts";
import { describe, expect, it } from "@effect/vitest";

import { wasTaskLaunchCommandNotAccepted, wasTaskWorkCommandNotAccepted } from "./orchestration.ts";

describe("orchestration errors", () => {
  it("distinguishes confirmed command rejection from an ambiguous failure", () => {
    expect(
      wasTaskLaunchCommandNotAccepted(
        new OrchestrationV2ThreadLaunchError({
          commandId: CommandId.make("launch"),
          projectId: ProjectId.make("project"),
          message: "Launch failed",
          commandNotAccepted: true,
        }),
      ),
    ).toBe(true);
    expect(
      wasTaskLaunchCommandNotAccepted(
        new OrchestrationV2ThreadLaunchError({
          commandId: CommandId.make("launch"),
          projectId: ProjectId.make("project"),
          message: "Launch outcome is unknown",
        }),
      ),
    ).toBe(false);
    expect(
      wasTaskWorkCommandNotAccepted(
        new OrchestrationV2DispatchCommandError({
          commandId: CommandId.make("work"),
          commandType: "message.dispatch",
          message: "Dispatch rejected",
          commandNotAccepted: true,
        }),
      ),
    ).toBe(true);
    expect(
      wasTaskWorkCommandNotAccepted(
        new OrchestrationV2DispatchCommandError({
          commandId: CommandId.make("work"),
          commandType: "message.dispatch",
          message: "Dispatch outcome is unknown",
        }),
      ),
    ).toBe(false);
    expect(wasTaskWorkCommandNotAccepted(new Error("Transport disconnected"))).toBe(false);
  });
});
