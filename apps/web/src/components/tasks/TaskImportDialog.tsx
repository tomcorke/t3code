import { squashAtomCommandFailure } from "@t3tools/client-runtime/state/runtime";
import type { EnvironmentId, TaskDocumentId } from "@t3tools/contracts";
import { useAtomValue } from "@effect/atom-react";
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
import { Input } from "~/components/ui/input";
import {
  readLegacyTaskUpdateInstructionsPath,
  removeLegacyTaskUpdateInstructionsPath,
  taskDocumentEnvironment,
  writeLegacyTaskUpdateInstructionsPath,
} from "~/state/taskDocuments";
import { serverEnvironment } from "~/state/server";
import { useAtomCommand } from "~/state/use-atom-command";

/** Paths are typed because they belong to the environment's machine, not this client's. */
export function TaskImportDialog(props: {
  readonly environmentId: EnvironmentId;
  readonly mode: "import" | "instructions";
  readonly onClose: () => void;
  readonly onImported?: (taskDocumentId: TaskDocumentId) => void;
}) {
  const importing = props.mode === "import";
  const register = useAtomCommand(taskDocumentEnvironment.register, { reportFailure: false });
  const updateSettings = useAtomCommand(serverEnvironment.updateSettings, { reportFailure: false });
  const serverConfig = useAtomValue(serverEnvironment.configValueAtom(props.environmentId));
  const canUpdateSettings = useAtomValue(
    serverEnvironment.updateSettings.permissionAtom(props.environmentId),
  );
  const [path, setPath] = useState("");
  const legacyPath = readLegacyTaskUpdateInstructionsPath(props.environmentId) ?? "";
  const [instructionsDraft, setInstructionsDraft] = useState<string | null>(null);
  const instructions =
    instructionsDraft ??
    (serverConfig?.settings.taskUpdateInstructionsPath.trim() || legacyPath || "");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    setError(null);
    const updatePath = instructions.trim();
    const configuredPath = serverConfig?.settings.taskUpdateInstructionsPath.trim() ?? "";
    const usingExistingLegacyPath =
      importing &&
      !canUpdateSettings &&
      serverConfig !== null &&
      configuredPath === "" &&
      legacyPath !== "" &&
      updatePath === legacyPath;
    if (!usingExistingLegacyPath && serverConfig !== null && updatePath === configuredPath) {
      removeLegacyTaskUpdateInstructionsPath(props.environmentId);
    } else if (!usingExistingLegacyPath && canUpdateSettings && serverConfig !== null) {
      setBusy(true);
      const saved = await updateSettings({
        environmentId: props.environmentId,
        input: { patch: { taskUpdateInstructionsPath: updatePath } },
      });
      setBusy(false);
      let settingsWriteError: string | null = null;
      let legacyFallbackIsSafe = false;
      if (saved._tag === "Failure") {
        const failure = squashAtomCommandFailure(saved);
        settingsWriteError =
          failure instanceof Error ? failure.message : "Could not save the update path.";
      } else if (saved.value.taskStarterSettingsPersisted !== true) {
        settingsWriteError =
          "Update T3 Code on this environment to save task initialization settings.";
        legacyFallbackIsSafe = saved.value.taskUpdateInstructionsPath.trim() === "";
      } else {
        removeLegacyTaskUpdateInstructionsPath(props.environmentId);
      }
      if (settingsWriteError !== null) {
        if (legacyFallbackIsSafe && importing) {
          writeLegacyTaskUpdateInstructionsPath(props.environmentId, updatePath);
        } else {
          setError(settingsWriteError);
          return;
        }
      }
    } else if (!usingExistingLegacyPath) {
      setError(
        serverConfig === null
          ? "Connect to this environment before saving the update path."
          : "You need Settings write access to change this environment's update path.",
      );
      return;
    }
    if (!importing) {
      props.onClose();
      return;
    }
    setBusy(true);
    const result = await register({
      environmentId: props.environmentId,
      input: { path: path.trim() },
    });
    setBusy(false);
    if (result._tag === "Success") {
      props.onImported?.(result.value.summary.taskDocumentId);
      props.onClose();
      return;
    }
    const failure = squashAtomCommandFailure(result);
    setError(failure instanceof Error ? failure.message : "Could not import this file.");
  };

  return (
    <Dialog open onOpenChange={(open) => !open && props.onClose()}>
      <DialogPopup className="max-w-lg">
        <form
          className="flex min-h-0 flex-col"
          onSubmit={(event) => {
            event.preventDefault();
            void submit();
          }}
        >
          <DialogHeader>
            <DialogTitle>{importing ? "Import task file" : "Update instructions file"}</DialogTitle>
            <DialogDescription>
              {importing
                ? "The Markdown file stays where it is and is not changed."
                : "New task threads read this file before they edit a task."}
            </DialogDescription>
          </DialogHeader>
          <DialogPanel>
            <div className="flex flex-col gap-3">
              {importing ? (
                <label className="flex flex-col gap-1 text-sm">
                  Task file path
                  <Input
                    autoFocus
                    value={path}
                    placeholder="C:\Tasks\my-task.md"
                    onChange={(event) => {
                      setPath(event.target.value);
                      setError(null);
                    }}
                  />
                </label>
              ) : null}
              <label className="flex flex-col gap-1 text-sm">
                Update instructions file path
                <Input
                  autoFocus={!importing}
                  value={instructions}
                  onChange={(event) => setInstructionsDraft(event.target.value)}
                />
              </label>
              {error ? (
                <p role="alert" className="text-destructive-foreground text-sm">
                  {error}
                </p>
              ) : null}
            </div>
          </DialogPanel>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={props.onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={busy || (importing && path.trim() === "")}>
              {importing ? "Import" : "Save"}
            </Button>
          </DialogFooter>
        </form>
      </DialogPopup>
    </Dialog>
  );
}
