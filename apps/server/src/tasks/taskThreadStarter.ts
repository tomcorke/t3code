import { DEFAULT_TASK_THREAD_STARTER_TEMPLATE, renderTaskThreadStarter } from "@t3tools/contracts";
import type { TaskThreadInitializationEnvelope } from "@t3tools/contracts";

export function taskThreadStarter(input: {
  readonly taskDocumentId: string;
  readonly canonicalPath: string;
  readonly updateInstructionsPath: string;
  readonly workspaceStrategy: TaskThreadInitializationEnvelope["workspaceStrategy"];
  readonly enrichment?: boolean | undefined;
}): string {
  return renderTaskThreadStarter({
    ...input,
    template: DEFAULT_TASK_THREAD_STARTER_TEMPLATE,
  });
}
