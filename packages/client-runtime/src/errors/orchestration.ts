import {
  OrchestrationDispatchCommandError,
  OrchestrationV2DispatchCommandError,
  OrchestrationV2ThreadLaunchError,
} from "@t3tools/contracts";
import * as Schema from "effect/Schema";

const isOrchestrationDispatchCommandError = Schema.is(OrchestrationDispatchCommandError);
const isOrchestrationV2DispatchCommandError = Schema.is(OrchestrationV2DispatchCommandError);
const isOrchestrationV2ThreadLaunchError = Schema.is(OrchestrationV2ThreadLaunchError);

export function wasBootstrapThreadDeleted(error: unknown): boolean {
  return (
    isOrchestrationDispatchCommandError(error) && error.bootstrapThreadDisposition === "deleted"
  );
}

export function wasBootstrapThreadNotCreated(error: unknown): boolean {
  return (
    isOrchestrationDispatchCommandError(error) && error.bootstrapThreadDisposition === "not-created"
  );
}

export function wasTaskLaunchCommandNotAccepted(error: unknown): boolean {
  return isOrchestrationV2ThreadLaunchError(error) && error.commandNotAccepted === true;
}

export function wasTaskWorkCommandNotAccepted(error: unknown): boolean {
  return (
    isOrchestrationV2DispatchCommandError(error) &&
    error.commandType === "message.dispatch" &&
    error.commandNotAccepted === true
  );
}
