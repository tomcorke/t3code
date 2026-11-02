import { useAtomValue } from "@effect/atom-react";
import { squashAtomCommandFailure } from "@t3tools/client-runtime/state/runtime";
import type { EnvironmentId, TaskDocumentId } from "@t3tools/contracts";
import { useEffect, useEffectEvent, useRef, useState } from "react";

import { Button } from "~/components/ui/button";
import { Checkbox } from "~/components/ui/checkbox";
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
import { Textarea } from "~/components/ui/textarea";
import { useNewTaskStore, type NewTaskPlan } from "~/newTaskStore";
import {
  readLegacyTaskFolder,
  removeLegacyTaskFolder,
  taskDocumentEnvironment,
} from "~/state/taskDocuments";
import { serverEnvironment } from "~/state/server";
import { useAtomCommand } from "~/state/use-atom-command";

/** Only plans the task; the file is made when the thread is sent, so cancelling a draft leaves nothing behind. */
export function TaskCreateDialog(props: {
  readonly environmentId: EnvironmentId;
  readonly taskDocumentId: TaskDocumentId;
  readonly initial?: NewTaskPlan | undefined;
  readonly onClose: () => void;
  readonly onPlanned: (taskDocumentId: TaskDocumentId) => void;
}) {
  const plan = useNewTaskStore((store) => store.plan);
  const existing = props.initial;
  const defaultFolder = useAtomCommand(taskDocumentEnvironment.defaultFolder, {
    reportFailure: false,
  });
  const updateSettings = useAtomCommand(serverEnvironment.updateSettings, { reportFailure: false });
  const hasSettingsWriteAccess = useAtomValue(
    serverEnvironment.updateSettings.permissionAtom(props.environmentId),
  );
  const serverConfig = useAtomValue(serverEnvironment.configValueAtom(props.environmentId));
  const serverConfigLoaded = serverConfig !== null;
  const canUpdateSettings = hasSettingsWriteAccess && serverConfigLoaded;
  const serverFolderSetting = serverConfig?.settings.newTaskFolder.trim() || null;
  const [title, setTitle] = useState(existing?.title ?? "");
  const [description, setDescription] = useState(existing?.description ?? "");
  const [folder, setFolder] = useState(
    () =>
      existing?.directory ??
      serverFolderSetting ??
      (serverConfigLoaded ? readLegacyTaskFolder(props.environmentId) : null) ??
      "",
  );
  const folderTouched = useRef(existing?.directory !== null && existing?.directory !== undefined);
  const [enrich, setEnrich] = useState(existing?.enrich ?? true);
  const [serverFolder, setServerFolder] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [serverFolderUnsupported, setServerFolderUnsupported] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const submitting = useRef(false);

  const fetchServerFolder = useEffectEvent((environmentId: EnvironmentId) =>
    defaultFolder({ environmentId, input: {} }),
  );
  // oxlint-disable-next-line t3code/no-unreasoned-state-sync -- only the environment's server knows where its managed task folder is
  useEffect(() => {
    let current = true;
    void fetchServerFolder(props.environmentId).then((result) => {
      if (current && result._tag === "Success") {
        setServerFolder(result.value.directory);
        setFolder((currentFolder) =>
          folderTouched.current
            ? currentFolder
            : (serverFolderSetting ??
              (serverConfigLoaded ? readLegacyTaskFolder(props.environmentId) : null) ??
              result.value.directory),
        );
      }
    });
    return () => {
      current = false;
    };
  }, [props.environmentId, serverConfigLoaded, serverFolderSetting]);

  const destination = folder.trim() || serverFolder;
  const close = () => {
    if (submitting.current) return;
    props.onClose();
  };
  const submit = async () => {
    if (submitting.current) return;
    const directory = folder.trim();
    if (canUpdateSettings && !serverFolderUnsupported) {
      submitting.current = true;
      setIsSubmitting(true);
      const result = await updateSettings({
        environmentId: props.environmentId,
        input: { patch: { newTaskFolder: directory } },
      });
      if (result._tag === "Failure") {
        submitting.current = false;
        setIsSubmitting(false);
        const failure = squashAtomCommandFailure(result);
        setError(
          failure instanceof Error
            ? `Could not save the server's default folder: ${failure.message}`
            : "Could not save the server's default folder. Try again before using this task.",
        );
        return;
      }
      if (result.value.newTaskFolderPersisted !== true) {
        submitting.current = false;
        setIsSubmitting(false);
        setServerFolderUnsupported(true);
        return;
      }
      removeLegacyTaskFolder(props.environmentId);
    }
    submitting.current = false;
    setIsSubmitting(false);
    const next: NewTaskPlan = {
      title: title.trim(),
      description: description.trim(),
      directory: directory || null,
      enrich,
    };
    plan(props.taskDocumentId, next);
    props.onPlanned(props.taskDocumentId);
    close();
  };

  return (
    <Dialog open onOpenChange={(open) => !open && close()}>
      <DialogPopup className="max-w-lg" showCloseButton={!isSubmitting}>
        <form
          className="flex min-h-0 flex-col"
          onSubmit={(event) => {
            event.preventDefault();
            submit();
          }}
        >
          <DialogHeader>
            <DialogTitle>Create new task</DialogTitle>
            <DialogDescription>
              The task file is created when you send this thread, and nothing is written before
              then.
            </DialogDescription>
          </DialogHeader>
          <DialogPanel>
            <div className="flex flex-col gap-3">
              <label className="flex flex-col gap-1 text-sm">
                Title
                <Input
                  autoFocus
                  maxLength={200}
                  value={title}
                  onChange={(event) => setTitle(event.target.value)}
                />
              </label>
              <label className="flex flex-col gap-1 text-sm">
                Description
                <Textarea
                  maxLength={20_000}
                  value={description}
                  placeholder="Kept word for word in the task file"
                  onChange={(event) => setDescription(event.target.value)}
                />
              </label>
              <label className="flex flex-col gap-1 text-sm">
                Folder
                <Input
                  value={folder}
                  placeholder={serverFolder ?? "Managed folder"}
                  onChange={(event) => {
                    folderTouched.current = true;
                    setFolder(event.target.value);
                    setError(null);
                  }}
                />
                <span className="text-muted-foreground text-xs">
                  Creates the file in {destination ?? "the environment's managed folder"}.{" "}
                  {serverFolderUnsupported
                    ? "This server did not save the shared default; this folder will apply to this task only."
                    : canUpdateSettings
                      ? "This server saves this as its default when it supports the setting."
                      : "The folder only applies to this task without settings write access."}
                </span>
              </label>
              {error ? (
                <p role="alert" className="text-destructive-foreground text-sm">
                  {error}
                </p>
              ) : null}
              <label className="flex items-center gap-2 text-sm">
                <Checkbox checked={enrich} onCheckedChange={(checked) => setEnrich(checked)} />
                Let this first thread enrich the task
              </label>
            </div>
          </DialogPanel>
          <DialogFooter>
            <Button type="button" variant="ghost" disabled={isSubmitting} onClick={close}>
              Cancel
            </Button>
            <Button type="submit" disabled={title.trim() === "" || isSubmitting}>
              {isSubmitting
                ? "Saving…"
                : serverFolderUnsupported
                  ? "Use for this task"
                  : "Use new task"}
            </Button>
          </DialogFooter>
        </form>
      </DialogPopup>
    </Dialog>
  );
}
