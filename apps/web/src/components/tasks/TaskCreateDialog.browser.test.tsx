import { AsyncResult } from "effect/reactivity";
import * as Cause from "effect/Cause";
import { EnvironmentId, TaskDocumentId } from "@t3tools/contracts";
import { expect, it, vi } from "vite-plus/test";
import { page, userEvent } from "vite-plus/test/browser";

import { render } from "../../../test/render";

const state = vi.hoisted(() => ({
  create: vi.fn(),
  defaultFolder: vi.fn(),
  legacyFolder: null as string | null,
  configLoaded: true,
  removeLegacyFolder: vi.fn(),
  settingsFolder: "",
  updateSettings: vi.fn(),
}));

vi.mock(import("~/state/taskDocuments"), () => ({
  taskDocumentEnvironment: {
    create: { name: "create" },
    defaultFolder: { name: "defaultFolder" },
  } as never,
  readLegacyTaskFolder: () => state.legacyFolder,
  removeLegacyTaskFolder: () => {
    state.removeLegacyFolder();
    state.legacyFolder = null;
  },
}));
vi.mock(import("~/state/use-atom-command"), () => ({
  useAtomCommand: ((command: { name: "create" | "defaultFolder" | "updateSettings" }) =>
    state[command.name]) as never,
}));
vi.mock(
  import("~/state/server"),
  () =>
    ({
      serverEnvironment: {
        updateSettings: { name: "updateSettings", permissionAtom: () => "permission" },
        configValueAtom: () => "serverConfig",
      },
    }) as never,
);
vi.mock(import("@effect/atom-react"), async (importOriginal) => ({
  ...(await importOriginal()),
  useAtomValue: ((atom: unknown) =>
    atom === "serverConfig"
      ? state.configLoaded
        ? { settings: { newTaskFolder: state.settingsFolder } }
        : null
      : true) as never,
}));

import { useNewTaskStore } from "~/newTaskStore";
import { TaskCreateDialog } from "./TaskCreateDialog";

const environmentId = EnvironmentId.make("create-dialog");
const taskDocumentId = TaskDocumentId.make("cccccccc-cccc-4ccc-8ccc-cccccccccccc");

it("plans a new task without writing a file, and cancelling plans nothing", async () => {
  state.legacyFolder = "/old/client/tasks";
  state.settingsFolder = "";
  state.updateSettings.mockReset();
  state.removeLegacyFolder.mockReset();
  state.updateSettings.mockResolvedValue(
    AsyncResult.success({ newTaskFolder: "/old/client/tasks", newTaskFolderPersisted: true }),
  );
  useNewTaskStore.setState({ byId: {} });
  state.defaultFolder.mockResolvedValue(AsyncResult.success({ directory: "/managed/tasks" }));
  const onClose = vi.fn();
  const onPlanned = vi.fn();
  const dialog = (
    <TaskCreateDialog
      environmentId={environmentId}
      taskDocumentId={taskDocumentId}
      onClose={onClose}
      onPlanned={onPlanned}
    />
  );
  // The dialog is a portal and needs no routes.
  await using cancelled = await render(dialog, { router: false });
  await expect
    .element(
      page.getByText(
        /Creates the file in \/old\/client\/tasks\. Changes are saved as this server's default\./,
      ),
    )
    .toBeVisible();
  await userEvent.type(page.getByRole("textbox", { name: "Title" }), "Abandoned");
  await userEvent.keyboard("{Escape}");
  expect(onClose).toHaveBeenCalledOnce();
  expect(useNewTaskStore.getState().byId).toEqual({});
  expect(onPlanned).not.toHaveBeenCalled();
  await cancelled[Symbol.asyncDispose]();

  await using _planned = await render(dialog, { router: false });
  await userEvent.type(page.getByRole("textbox", { name: "Title" }), "  Ship it  ");
  await userEvent.type(page.getByRole("textbox", { name: "Description" }), "Plan the release");
  await userEvent.type(page.getByRole("textbox", { name: "Title" }), "{Enter}");
  expect(useNewTaskStore.getState().byId).toEqual({
    [taskDocumentId]: {
      title: "Ship it",
      description: "Plan the release",
      directory: "/old/client/tasks",
      enrich: true,
    },
  });
  expect(onPlanned).toHaveBeenCalledWith(taskDocumentId);
  expect(state.create).not.toHaveBeenCalled();
  expect(state.updateSettings).toHaveBeenCalledWith({
    environmentId,
    input: { patch: { newTaskFolder: "/old/client/tasks" } },
  });
  expect(state.removeLegacyFolder).toHaveBeenCalledOnce();
});

it("retires a legacy folder preference after successfully clearing the server default", async () => {
  state.legacyFolder = "/old/client/tasks";
  state.settingsFolder = "";
  state.removeLegacyFolder.mockReset();
  state.updateSettings.mockResolvedValue(
    AsyncResult.success({ newTaskFolder: "", newTaskFolderPersisted: true }),
  );
  state.defaultFolder.mockResolvedValue(AsyncResult.success({ directory: "/managed/tasks" }));
  useNewTaskStore.setState({ byId: {} });
  const onClose = vi.fn();
  const onPlanned = vi.fn();

  {
    await using _screen = await render(
      <TaskCreateDialog
        environmentId={environmentId}
        taskDocumentId={taskDocumentId}
        onClose={onClose}
        onPlanned={onPlanned}
      />,
      { router: false },
    );
    const folder = page.getByRole("textbox", { name: /Folder/ });
    await expect.element(folder).toHaveValue("/old/client/tasks");
    await userEvent.clear(folder);
    await userEvent.type(page.getByRole("textbox", { name: "Title" }), "Use managed folder{Enter}");

    expect(state.updateSettings).toHaveBeenCalledWith({
      environmentId,
      input: { patch: { newTaskFolder: "" } },
    });
    expect(state.removeLegacyFolder).toHaveBeenCalledOnce();
    expect(useNewTaskStore.getState().byId[taskDocumentId]?.directory).toBeNull();
    expect(onPlanned).toHaveBeenCalledOnce();
    expect(onClose).toHaveBeenCalledOnce();
  }

  await using _reopened = await render(
    <TaskCreateDialog
      environmentId={environmentId}
      taskDocumentId={TaskDocumentId.make("ffffffff-ffff-4fff-8fff-ffffffffffff")}
      onClose={vi.fn()}
      onPlanned={vi.fn()}
    />,
    { router: false },
  );
  await expect.element(page.getByRole("textbox", { name: /Folder/ })).toHaveValue("/managed/tasks");
});

it("keeps the dialog open and does not plan a task when saving the server default fails", async () => {
  state.legacyFolder = "/old/client/tasks";
  state.settingsFolder = "";
  state.removeLegacyFolder.mockReset();
  state.updateSettings.mockResolvedValue(
    AsyncResult.failure(Cause.fail(new Error("Server unavailable"))),
  );
  state.defaultFolder.mockResolvedValue(AsyncResult.success({ directory: "/managed/tasks" }));
  useNewTaskStore.setState({ byId: {} });
  const onClose = vi.fn();
  const onPlanned = vi.fn();

  await using _screen = await render(
    <TaskCreateDialog
      environmentId={environmentId}
      taskDocumentId={taskDocumentId}
      onClose={onClose}
      onPlanned={onPlanned}
    />,
    { router: false },
  );
  await userEvent.type(page.getByRole("textbox", { name: "Title" }), "Retry me{Enter}");

  await expect
    .element(page.getByRole("alert"))
    .toHaveTextContent("Could not save the server's default folder: Server unavailable");
  expect(onClose).not.toHaveBeenCalled();
  expect(onPlanned).not.toHaveBeenCalled();
  expect(useNewTaskStore.getState().byId).toEqual({});
  expect(state.removeLegacyFolder).not.toHaveBeenCalled();
  expect(state.legacyFolder).toBe("/old/client/tasks");
});

it("keeps the legacy folder when an older server does not confirm the new setting", async () => {
  state.legacyFolder = "/old/client/tasks";
  state.settingsFolder = "";
  state.updateSettings.mockResolvedValue(AsyncResult.success({ newTaskFolder: "" }));
  state.removeLegacyFolder.mockReset();
  state.defaultFolder.mockResolvedValue(AsyncResult.success({ directory: "/managed/tasks" }));
  useNewTaskStore.setState({ byId: {} });
  const onClose = vi.fn();
  const onPlanned = vi.fn();

  await using _screen = await render(
    <TaskCreateDialog
      environmentId={environmentId}
      taskDocumentId={taskDocumentId}
      onClose={onClose}
      onPlanned={onPlanned}
    />,
    { router: false },
  );
  await userEvent.type(page.getByRole("textbox", { name: "Title" }), "Keep compatibility{Enter}");

  expect(state.removeLegacyFolder).not.toHaveBeenCalled();
  expect(state.legacyFolder).toBe("/old/client/tasks");
  expect(useNewTaskStore.getState().byId[taskDocumentId]?.directory).toBe("/old/client/tasks");
  expect(onPlanned).toHaveBeenCalledOnce();
  expect(onClose).toHaveBeenCalledOnce();
});

it("blocks dismissal while saving the server default", async () => {
  state.legacyFolder = "/old/client/tasks";
  state.settingsFolder = "";
  let resolveUpdateSettings!: (value: unknown) => void;
  state.updateSettings.mockReturnValue(
    new Promise<unknown>((resolve) => {
      resolveUpdateSettings = resolve;
    }),
  );
  state.removeLegacyFolder.mockReset();
  state.defaultFolder.mockResolvedValue(AsyncResult.success({ directory: "/managed/tasks" }));
  useNewTaskStore.setState({ byId: {} });
  const onClose = vi.fn();
  const onPlanned = vi.fn();

  await using _screen = await render(
    <TaskCreateDialog
      environmentId={environmentId}
      taskDocumentId={taskDocumentId}
      onClose={onClose}
      onPlanned={onPlanned}
    />,
    { router: false },
  );
  await userEvent.type(page.getByRole("textbox", { name: "Title" }), "Cancel pending save{Enter}");
  await userEvent.keyboard("{Escape}");
  expect(onClose).not.toHaveBeenCalled();
  await expect.element(page.getByRole("button", { name: "Cancel" })).toBeDisabled();
  await expect.element(page.getByRole("button", { name: "Saving…" })).toBeDisabled();

  resolveUpdateSettings(
    AsyncResult.success({ newTaskFolder: "/old/client/tasks", newTaskFolderPersisted: true }),
  );
  await Promise.resolve();

  expect(state.removeLegacyFolder).toHaveBeenCalledOnce();
  expect(useNewTaskStore.getState().byId[taskDocumentId]?.directory).toBe("/old/client/tasks");
  expect(onPlanned).toHaveBeenCalledOnce();
  expect(onClose).toHaveBeenCalledOnce();
});

it("prefers the environment folder over a legacy browser preference", async () => {
  state.legacyFolder = "/old/client/tasks";
  state.settingsFolder = "/server/tasks";
  state.defaultFolder.mockResolvedValue(AsyncResult.success({ directory: "/server/tasks" }));
  const onClose = vi.fn();
  const onPlanned = vi.fn();
  await using _screen = await render(
    <TaskCreateDialog
      environmentId={environmentId}
      taskDocumentId={TaskDocumentId.make("dddddddd-dddd-4ddd-8ddd-dddddddddddd")}
      onClose={onClose}
      onPlanned={onPlanned}
    />,
    { router: false },
  );

  await expect.element(page.getByRole("textbox", { name: /Folder/ })).toHaveValue("/server/tasks");
});

it("keeps a folder edit made before the managed folder loads", async () => {
  state.legacyFolder = null;
  state.settingsFolder = "";
  let resolveDefaultFolder!: (value: unknown) => void;
  state.defaultFolder.mockReturnValue(
    new Promise<unknown>((resolve) => {
      resolveDefaultFolder = resolve;
    }),
  );
  await using _screen = await render(
    <TaskCreateDialog
      environmentId={environmentId}
      taskDocumentId={TaskDocumentId.make("eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee")}
      onClose={vi.fn()}
      onPlanned={vi.fn()}
    />,
    { router: false },
  );

  const folder = page.getByRole("textbox", { name: /Folder/ });
  await userEvent.type(folder, "/chosen/tasks");
  resolveDefaultFolder(AsyncResult.success({ directory: "/managed/tasks" }));

  await expect.element(folder).toHaveValue("/chosen/tasks");
});

it("does not use or migrate a legacy folder before server config loads", async () => {
  state.legacyFolder = "/old/client/tasks";
  state.configLoaded = false;
  state.settingsFolder = "";
  state.updateSettings.mockReset().mockResolvedValue(AsyncResult.success(undefined));
  state.removeLegacyFolder.mockReset();
  state.defaultFolder.mockResolvedValue(AsyncResult.success({ directory: "/managed/tasks" }));
  useNewTaskStore.setState({ byId: {} });
  const onClose = vi.fn();
  const onPlanned = vi.fn();

  await using _screen = await render(
    <TaskCreateDialog
      environmentId={environmentId}
      taskDocumentId={taskDocumentId}
      onClose={onClose}
      onPlanned={onPlanned}
    />,
    { router: false },
  );
  const folder = page.getByRole("textbox", { name: /Folder/ });
  await expect.element(folder).toHaveValue("/managed/tasks");
  await expect.element(page.getByText(/The folder only applies to this task/)).toBeVisible();
  await userEvent.type(page.getByRole("textbox", { name: "Title" }), "Keep server default{Enter}");

  expect(state.updateSettings).not.toHaveBeenCalled();
  expect(state.removeLegacyFolder).not.toHaveBeenCalled();
  expect(state.legacyFolder).toBe("/old/client/tasks");
  expect(useNewTaskStore.getState().byId[taskDocumentId]?.directory).toBe("/managed/tasks");
  expect(onPlanned).toHaveBeenCalledOnce();
  expect(onClose).toHaveBeenCalledOnce();
});
