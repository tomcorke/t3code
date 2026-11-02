// @effect-diagnostics nodeBuiltinImport:off
import * as NodeFS from "node:fs";
import * as NodePath from "node:path";

const isCheckInput = (file: string) =>
  file.endsWith(".d.ts") ||
  NodePath.posix.basename(file).startsWith(".env") ||
  file.split("/").some((part) => part === ".generated" || part === ".astro");

export function collectIgnoredCheckInputs(
  root: string,
  ignoredPaths: ReadonlyArray<string>,
  trackedPaths: ReadonlySet<string>,
): ReadonlyArray<string> {
  const files = new Set<string>();
  const add = (file: string) => {
    if (isCheckInput(file) && !trackedPaths.has(file)) files.add(file);
  };
  const visit = (directory: string) => {
    for (const entry of NodeFS.readdirSync(NodePath.join(root, ...directory.split("/")), {
      withFileTypes: true,
    })) {
      const file = NodePath.posix.join(directory, entry.name);
      if (entry.isDirectory()) {
        if (entry.name !== "node_modules") visit(file);
      } else {
        add(file);
      }
    }
  };

  for (const path of ignoredPaths) {
    if (path.endsWith("/")) {
      const directory = path.slice(0, -1);
      if (NodePath.posix.basename(directory) !== "node_modules") visit(directory);
    } else {
      add(path);
    }
  }
  return [...files].sort();
}
