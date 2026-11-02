// @effect-diagnostics nodeBuiltinImport:off
import * as NodeChildProcess from "node:child_process";
import * as NodeFS from "node:fs";
import * as NodeOS from "node:os";
import * as NodePath from "node:path";
import { expect, it } from "vite-plus/test";

import {
  filterIgnoredCheckInputs,
  ignoredCheckInputPathspecs,
} from "./check-changed-ignored-inputs.ts";

it("preserves eligible ignored cache inputs while pruning node_modules", () => {
  const root = NodeFS.mkdtempSync(NodePath.join(NodeOS.tmpdir(), "t3-check-changed-ignored-"));
  const git = (...args: string[]) =>
    NodeChildProcess.execFileSync("git", args, { cwd: root, encoding: "utf8" }).trim();
  const write = (file: string) => {
    const path = NodePath.join(root, ...file.split("/"));
    NodeFS.mkdirSync(NodePath.dirname(path), { recursive: true });
    NodeFS.writeFileSync(path, file);
  };
  try {
    git("init", "--quiet");
    NodeFS.writeFileSync(NodePath.join(root, ".gitignore"), "*\n");
    write("apps/mobile/.generated/source.js");
    write("apps/web/.astro/types.d.ts");
    write("cache/ambient.d.ts");
    write(".env.local");
    write(".env-cache/private.txt");
    write("cache/readme.txt");
    write("node_modules/package/types.d.ts");
    write("cache/node_modules/nested-package/types.d.ts");
    write(".t3/session/agent.d.ts");
    write("build/generated/types.d.ts");
    write("apps/web/dist/generated/types.d.ts");
    write(".turbo/cache/.env.local");
    write("packages/client-runtime/target/types.d.ts");
    write("cache/tracked.d.ts");
    git("add", "-f", "cache/tracked.d.ts");
    const previous = git(
      "-c",
      "core.quotePath=false",
      "ls-files",
      "--others",
      "--ignored",
      "--exclude-standard",
      "--",
      ":(glob)**/.generated/**",
      ":(glob)**/.astro/**",
      ":(glob)**/*.d.ts",
      ":(glob)**/.env*",
      ":(exclude,glob)**/node_modules/**",
    )
      .split("\n")
      .filter(Boolean)
      .sort();
    const collapsed = git(
      "-c",
      "core.quotePath=false",
      "ls-files",
      "--others",
      "--ignored",
      "--exclude-standard",
      "--directory",
    )
      .split("\n")
      .filter(Boolean);
    const select = (ignoredPaths: ReadonlyArray<string>) =>
      filterIgnoredCheckInputs(
        git(
          "ls-files",
          "--others",
          "--ignored",
          "--exclude-standard",
          "--",
          ...ignoredCheckInputPathspecs(ignoredPaths),
        )
          .split("\n")
          .filter(Boolean),
      );
    expect(select(collapsed)).toEqual(previous);
    expect(
      select([
        ...collapsed,
        "apps/mobile/.generated/",
        "apps/web/.astro/",
        "node_modules/package/",
      ]),
    ).toEqual(previous);
    expect(previous).toEqual([
      ".env.local",
      ".t3/session/agent.d.ts",
      ".turbo/cache/.env.local",
      "apps/mobile/.generated/source.js",
      "apps/web/.astro/types.d.ts",
      "apps/web/dist/generated/types.d.ts",
      "build/generated/types.d.ts",
      "cache/ambient.d.ts",
      "packages/client-runtime/target/types.d.ts",
    ]);
  } finally {
    NodeFS.rmSync(root, { recursive: true, force: true });
  }
});
