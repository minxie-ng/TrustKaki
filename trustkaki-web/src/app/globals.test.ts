import { readFileSync, readdirSync } from "node:fs";
import { extname, join } from "node:path";
import { describe, expect, it } from "vitest";

const sourceRoots = [join(process.cwd(), "src/app"), join(process.cwd(), "src/components")];
const sourceExtensions = new Set([".css", ".ts", ".tsx"]);

function sourceFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return sourceFiles(path);
    return sourceExtensions.has(extname(entry.name)) ? [path] : [];
  });
}

describe("global visual tokens", () => {
  const globals = readFileSync(join(process.cwd(), "src/app/globals.css"), "utf8");

  it("declares every care token referenced by app and component source", () => {
    const declarations = new Set(
      [...globals.matchAll(/(--care-[a-z0-9-]+)\s*:/g)].map((match) => match[1])
    );
    const references = new Set(
      sourceRoots
        .flatMap(sourceFiles)
        .flatMap((file) => [
          ...readFileSync(file, "utf8").matchAll(/var\((--care-[a-z0-9-]+)/g),
        ])
        .map((match) => match[1])
    );

    expect([...references].filter((token) => !declarations.has(token))).toEqual([]);
  });

  it("places the universal border default in Tailwind's base layer", () => {
    expect(globals).toMatch(
      /@layer\s+base\s*\{[\s\S]*?\*\s*\{\s*border-color:\s*var\(--care-hairline\);\s*\}[\s\S]*?\}/
    );
    expect(globals.replace(/@layer\s+base\s*\{[\s\S]*?\n\}/, "")).not.toMatch(
      /\*\s*\{\s*border-color:/
    );
  });
});
