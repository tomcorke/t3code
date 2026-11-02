import { AsyncResult } from "effect/reactivity";
import { EnvironmentId, TaskDocumentId } from "@t3tools/contracts";
import { expect, it, vi } from "vite-plus/test";
import { page, userEvent } from "vite-plus/test/browser";

import { render } from "../../../test/render";

const state = vi.hoisted(() => ({
  create: vi.fn(),
  defaultFolder: vi.fn(),
  updateSettings: vi.fn(),
}));

vi.mock(import("~/state/taskDocuments"), () => ({
  taskDocumentEnvironment: {
    create: { name: "create" },
    defaultFolder: { name: "defaultFolder" },
  } as never,
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
      },
    }) as never,
);
vi.mock(import("@effect/atom-react"), async (importOriginal) => ({
  ...(await importOriginal()),
  useAtomValue: () => true,
}));

import { useNewTaskStore } from "~/newTaskStore";
import { TaskCreateDialog } from "./TaskCreateDialog";

const environmentId = EnvironmentId.make("create-dialog");
const taskDocumentId = TaskDocumentId.make("cccccccc-cccc-4ccc-8ccc-cccccccccccc");

it("plans a new task without writing a file, and cancelling plans nothing", async () => {
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
        /Creates the file in \/managed\/tasks\. Changes are saved as this server's default\./,
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
      directory: "/managed/tasks",
      enrich: true,
    },
  });
  expect(onPlanned).toHaveBeenCalledWith(taskDocumentId);
  expect(state.create).not.toHaveBeenCalled();
  expect(state.updateSettings).toHaveBeenCalledWith({
    environmentId,
    input: { patch: { newTaskFolder: "/managed/tasks" } },
  });
});
