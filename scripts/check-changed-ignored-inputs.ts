const isCheckInput = (file: string) =>
  file.endsWith(".d.ts") ||
  file.split("/").at(-1)?.startsWith(".env") === true ||
  file.split("/").some((part) => part === ".generated" || part === ".astro");
const hasNodeModulesSegment = (file: string) => file.split("/").includes("node_modules");
const escapeGlobPath = (path: string) =>
  path
    .replaceAll("\\", "\\\\")
    .replaceAll("*", "\\*")
    .replaceAll("?", "\\?")
    .replaceAll("[", "\\[")
    .replaceAll("]", "\\]");

const matchingGlobs = [
  "*.d.ts",
  "**/*.d.ts",
  ".env*",
  "**/.env*",
  ".generated/**",
  "**/.generated/**",
  ".astro/**",
  "**/.astro/**",
];

export function ignoredCheckInputPathspecs(ignoredPaths: ReadonlyArray<string>) {
  const pathspecs = new Set<string>();
  for (const path of ignoredPaths) {
    if (hasNodeModulesSegment(path)) continue;
    if (!path.endsWith("/")) {
      if (isCheckInput(path)) pathspecs.add(`:(literal)${path}`);
      continue;
    }

    const directory = escapeGlobPath(path.slice(0, -1));
    if ([".generated", ".astro"].includes(directory.split("/").at(-1) ?? "")) {
      pathspecs.add(`:(glob)${directory}/**`);
      pathspecs.add(`:(exclude,glob)${directory}/**/node_modules/**`);
      continue;
    }
    for (const glob of matchingGlobs) pathspecs.add(`:(glob)${directory}/${glob}`);
    pathspecs.add(`:(exclude,glob)${directory}/**/node_modules/**`);
  }
  return [...pathspecs];
}

export function filterIgnoredCheckInputs(paths: ReadonlyArray<string>) {
  return paths.filter((path) => !hasNodeModulesSegment(path) && isCheckInput(path)).sort();
}
