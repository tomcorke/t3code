import { squashAtomCommandFailure } from "@t3tools/client-runtime/state/runtime";
import type {
  EnvironmentId,
  TaskDocumentRecovery,
  TaskDocumentRecoveryRef,
} from "@t3tools/contracts";
import { useState } from "react";

import { Button } from "~/components/ui/button";
import {
  Dialog,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogPanel,
  DialogPopup,
  DialogTitle,
} from "~/components/ui/dialog";
import { taskDocumentEnvironment } from "~/state/taskDocuments";
import { useAtomCommand } from "~/state/use-atom-command";

const RECOVERY_PREVIEW_LIMIT = 4_000;

export function TaskDocumentRecoveryDialog(props: {
  readonly environmentId: EnvironmentId;
  readonly records: ReadonlyArray<TaskDocumentRecoveryRef>;
  readonly hasUnsavedDraft: boolean;
  readonly onRestore: (recovery: TaskDocumentRecovery) => boolean;
  readonly onClose: () => void;
}) {
  const readRecovery = useAtomCommand(taskDocumentEnvironment.readRecovery, {
    reportFailure: false,
  });
  const [selected, setSelected] = useState<TaskDocumentRecovery | null>(null);
  const [loadingId, setLoadingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const openRecovery = async (record: TaskDocumentRecoveryRef) => {
    setLoadingId(record.recoveryId);
    setError(null);
    const result = await readRecovery({ environmentId: props.environmentId, input: record });
    setLoadingId(null);
    if (result._tag === "Success") {
      setSelected(result.value);
    } else {
      const failure = squashAtomCommandFailure(result);
      setError(failure instanceof Error ? failure.message : "Could not open this recovery copy.");
    }
  };

  const restore = () => {
    if (selected === null) return;
    if (props.onRestore(selected)) props.onClose();
    else setError("This recovery copy could not be restored. Reload the task and try again.");
  };

  return (
    <Dialog open onOpenChange={(open) => !open && props.onClose()}>
      <DialogPopup className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Task recovery copies</DialogTitle>
          <DialogDescription>
            Preview a server copy, then restore it as your local draft. The task file is unchanged
            until you save.
          </DialogDescription>
        </DialogHeader>
        <DialogPanel>
          <div className="flex min-h-0 flex-col gap-3">
            <ul className="flex max-h-32 flex-col gap-1 overflow-auto">
              {props.records.map((record) => (
                <li key={record.recoveryId}>
                  <Button
                    size="sm"
                    variant={selected?.recoveryId === record.recoveryId ? "secondary" : "outline"}
                    disabled={loadingId !== null}
                    onClick={() => void openRecovery(record)}
                  >
                    {loadingId === record.recoveryId
                      ? "Opening copy…"
                      : `Recovery copy ${record.recoveryId.slice(0, 8)}`}
                  </Button>
                </li>
              ))}
            </ul>
            {props.hasUnsavedDraft ? (
              <p className="text-muted-foreground text-sm">
                Restoring a copy replaces the current unsaved browser draft.
              </p>
            ) : null}
            {selected ? (
              <pre className="max-h-64 overflow-auto rounded-md border border-border bg-muted/40 p-3 text-xs">
                {selected.contents.slice(0, RECOVERY_PREVIEW_LIMIT)}
                {selected.contents.length > RECOVERY_PREVIEW_LIMIT ? "\n… preview shortened" : ""}
              </pre>
            ) : (
              <p className="text-muted-foreground text-sm">Choose a recovery copy to preview it.</p>
            )}
            {error ? (
              <p role="alert" className="text-destructive-foreground text-sm">
                {error}
              </p>
            ) : null}
          </div>
        </DialogPanel>
        <DialogFooter>
          <Button variant="ghost" onClick={props.onClose}>
            Cancel
          </Button>
          <Button onClick={restore} disabled={selected === null || loadingId !== null}>
            {props.hasUnsavedDraft ? "Replace current draft" : "Restore draft"}
          </Button>
        </DialogFooter>
      </DialogPopup>
    </Dialog>
  );
}
