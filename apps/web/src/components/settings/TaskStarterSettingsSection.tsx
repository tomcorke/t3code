import { useAtomValue } from "@effect/atom-react";
import { renderTaskThreadStarter, taskThreadStarterTemplateError } from "@t3tools/contracts";
import type { EnvironmentId } from "@t3tools/contracts";
import { useState } from "react";

import { squashAtomCommandFailure } from "@t3tools/client-runtime/state/runtime";
import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/input";
import { Textarea } from "~/components/ui/textarea";
import {
  readLegacyTaskUpdateInstructionsPath,
  removeLegacyTaskUpdateInstructionsPath,
} from "~/state/taskDocuments";
import { serverEnvironment } from "~/state/server";
import { useAtomCommand } from "~/state/use-atom-command";
import { SettingsSection } from "./settingsLayout";

const SAMPLE_TASK_PATH = "C:\\Tasks\\example\\PLAN.md";
const SAMPLE_UPDATE_PATH = "C:\\Tasks\\example\\UPDATE.md";

function TaskStarterSettingsEditor(props: {
  readonly environmentId: EnvironmentId;
  readonly label: string;
  readonly showEnvironment: boolean;
}) {
  const serverConfig = useAtomValue(serverEnvironment.configValueAtom(props.environmentId));
  const canWrite = useAtomValue(
    serverEnvironment.updateSettings.permissionAtom(props.environmentId),
  );
  const updateSettings = useAtomCommand(serverEnvironment.updateSettings, { reportFailure: false });
  const settings = serverConfig?.settings;
  const [templateDraft, setTemplateDraft] = useState<string | null>(null);
  const [updatePathDraft, setUpdatePathDraft] = useState<string | null>(null);
  const [savedSettings, setSavedSettings] = useState<{
    readonly baseline: {
      readonly taskStarterTemplate: string;
      readonly taskUpdateInstructionsPath: string;
      readonly taskStarterTemplateVersion: number;
    };
    readonly value: {
      readonly taskStarterTemplate: string;
      readonly taskUpdateInstructionsPath: string;
      readonly taskStarterTemplateVersion: number;
    };
  } | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const serverSettings = {
    taskStarterTemplate: settings?.taskStarterTemplate ?? "",
    taskUpdateInstructionsPath: settings?.taskUpdateInstructionsPath ?? "",
    taskStarterTemplateVersion: settings?.taskStarterTemplateVersion ?? 1,
  };
  const currentSettings =
    savedSettings !== null &&
    settings !== undefined &&
    serverSettings.taskStarterTemplate === savedSettings.baseline.taskStarterTemplate &&
    serverSettings.taskUpdateInstructionsPath ===
      savedSettings.baseline.taskUpdateInstructionsPath &&
    serverSettings.taskStarterTemplateVersion === savedSettings.baseline.taskStarterTemplateVersion
      ? savedSettings.value
      : serverSettings;
  const template = templateDraft ?? currentSettings.taskStarterTemplate;
  const legacyUpdatePath = readLegacyTaskUpdateInstructionsPath(props.environmentId) ?? "";
  const updatePath =
    updatePathDraft ??
    (currentSettings.taskUpdateInstructionsPath.trim() || legacyUpdatePath || "");
  const templateVersion = currentSettings.taskStarterTemplateVersion;
  const templateError = settings ? taskThreadStarterTemplateError(template) : null;
  const clearingLegacyPath =
    currentSettings.taskUpdateInstructionsPath.trim() === "" &&
    legacyUpdatePath !== "" &&
    updatePathDraft !== null &&
    updatePath.trim() === "";
  const dirty =
    template !== currentSettings.taskStarterTemplate ||
    updatePath.trim() !== currentSettings.taskUpdateInstructionsPath ||
    clearingLegacyPath;
  const preview = renderTaskThreadStarter({
    template,
    taskDocumentId: "task:example",
    canonicalPath: SAMPLE_TASK_PATH,
    updateInstructionsPath: updatePath.trim() || SAMPLE_UPDATE_PATH,
    workspaceStrategy: { type: "worktree", branch: "task/example" },
    enrichment: true,
  });

  const save = async () => {
    if (!settings || templateError || !canWrite || saving) return;
    setError(null);
    const patch = {
      ...(template !== currentSettings.taskStarterTemplate
        ? { taskStarterTemplate: template }
        : {}),
      ...(updatePath.trim() !== currentSettings.taskUpdateInstructionsPath
        ? { taskUpdateInstructionsPath: updatePath.trim() }
        : {}),
    };
    if (Object.keys(patch).length === 0) {
      removeLegacyTaskUpdateInstructionsPath(props.environmentId);
      setTemplateDraft(null);
      setUpdatePathDraft(null);
      return;
    }
    setSaving(true);
    const baseline = {
      taskStarterTemplate: settings.taskStarterTemplate,
      taskUpdateInstructionsPath: settings.taskUpdateInstructionsPath,
      taskStarterTemplateVersion: settings.taskStarterTemplateVersion,
    };
    const result = await updateSettings({
      environmentId: props.environmentId,
      input: { patch },
    });
    setSaving(false);
    if (result._tag === "Failure") {
      const failure = squashAtomCommandFailure(result);
      setError(failure instanceof Error ? failure.message : "Could not save task settings.");
      return;
    }
    if (result.value.taskStarterSettingsPersisted !== true) {
      setError("Update T3 Code on this environment to save task initialization settings.");
      return;
    }
    setSavedSettings({
      baseline,
      value: {
        taskStarterTemplate: result.value.taskStarterTemplate,
        taskUpdateInstructionsPath: result.value.taskUpdateInstructionsPath,
        taskStarterTemplateVersion: result.value.taskStarterTemplateVersion,
      },
    });
    setTemplateDraft(null);
    setUpdatePathDraft(null);
    removeLegacyTaskUpdateInstructionsPath(props.environmentId);
  };

  return (
    <div className="space-y-4 p-4">
      {props.showEnvironment ? (
        <h3 className="text-sm font-medium text-foreground">{props.label}</h3>
      ) : null}
      {!settings ? (
        <p className="text-sm text-muted-foreground">
          Connect to edit task initialization settings.
        </p>
      ) : (
        <>
          <label className="flex flex-col gap-1.5 text-sm">
            Update-discipline reference path
            <Input
              value={updatePath}
              disabled={!canWrite || saving}
              onChange={(event) => {
                setUpdatePathDraft(event.target.value);
                setError(null);
              }}
              placeholder="C:\\Tasks\\UPDATE.md"
              spellCheck={false}
              aria-label={`Update-discipline reference path for ${props.label}`}
            />
          </label>
          <label className="flex flex-col gap-1.5 text-sm">
            Starter template
            <Textarea
              value={template}
              disabled={!canWrite || saving}
              onChange={(event) => {
                setTemplateDraft(event.target.value);
                setError(null);
              }}
              rows={10}
              spellCheck={false}
              aria-label={`Task starter template for ${props.label}`}
            />
          </label>
          <div className="space-y-2">
            <div className="text-xs text-muted-foreground">
              Template version {templateVersion}. Changes apply to new task threads only. Preview
              uses a synthetic task and quoted paths.
            </div>
            <pre className="max-h-72 overflow-auto whitespace-pre-wrap rounded-md border border-border bg-muted/30 p-3 font-mono text-xs leading-relaxed text-foreground">
              {preview}
            </pre>
          </div>
          {!canWrite ? (
            <p className="text-xs text-muted-foreground">
              Settings write access is required to save.
            </p>
          ) : null}
          {templateError ? (
            <p role="alert" className="text-sm text-destructive-foreground">
              {templateError}
            </p>
          ) : null}
          {error ? (
            <p role="alert" className="text-sm text-destructive-foreground">
              {error}
            </p>
          ) : null}
          <div className="flex justify-end">
            <Button
              type="button"
              disabled={!canWrite || !dirty || Boolean(templateError) || saving}
              onClick={() => void save()}
            >
              {saving ? "Saving…" : "Save task settings"}
            </Button>
          </div>
        </>
      )}
    </div>
  );
}

export function TaskStarterSettingsSection(props: {
  readonly environments: ReadonlyArray<{
    readonly environmentId: EnvironmentId;
    readonly label: string;
  }>;
}) {
  if (props.environments.length === 0) return null;
  return (
    <SettingsSection id="task-initialization" title="Task initialization">
      {props.environments.map((environment, index) => (
        <div
          className={index === 0 ? "" : "border-t border-border"}
          key={environment.environmentId}
        >
          <TaskStarterSettingsEditor
            environmentId={environment.environmentId}
            label={environment.label}
            showEnvironment={props.environments.length > 1}
          />
        </div>
      ))}
    </SettingsSection>
  );
}
