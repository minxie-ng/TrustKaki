import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, test } from "vitest";

const sourceRoots = ["src/app", "src/components"];
interface SourceFile {
  path: string;
  content: string;
  lines: string[];
}

function productionFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const entryPath = path.join(directory, entry.name);
    if (entry.isDirectory()) return productionFiles(entryPath);
    const isTestFile = entry.name.includes(".test.") || entry.name.includes(".spec.");
    if (!/\.(?:tsx|css)$/.test(entry.name) || isTestFile) {
      return [];
    }
    return [entryPath];
  });
}

const sources: SourceFile[] = sourceRoots.flatMap(productionFiles).map((filePath) => {
  const content = readFileSync(filePath, "utf8");
  return {
    path: filePath.split(path.sep).join("/"),
    content,
    lines: content.split("\n"),
  };
});

function violations(pattern: RegExp): string[] {
  return sources.flatMap((source) =>
    source.lines.flatMap((line, index) => {
      const matches = [...line.matchAll(pattern)];
      return matches.map(
        (match) => `${source.path}:${index + 1} contains ${JSON.stringify(match[0])}`
      );
    })
  );
}

function expectNoViolations(rule: string, findings: string[]) {
  expect(findings, `${rule}\n${findings.join("\n")}`).toEqual([]);
}

describe("care desk visual system", () => {
  test("uses no shadow utilities or CSS shadows", () => {
    expectNoViolations(
      "Remove shadows; care desk surfaces must remain flat.",
      violations(/(?<![\w-])(?:[\w-]+:)*shadow(?:-[^\s"'`}>]+)?(?![\w-])|(?:box|text)-shadow\s*:/g)
    );
  });

  test("uses no gradients", () => {
    expectNoViolations(
      "Remove gradients and use an exact care color token.",
      violations(
        /(?<![\w-])(?:[\w-]+:)*(?:bg|border)-(?:gradient|linear|radial)(?:-[^\s"'`}>]+)?(?![\w-])|(?:linear|radial)-gradient\s*\(/g
      )
    );
  });

  test("uses no blur utilities, drop shadows, or CSS blur filters", () => {
    expectNoViolations(
      "Remove blur and drop-shadow effects; content must remain crisp.",
      violations(
        /(?<![\w-])(?:[\w-]+:)*(?:backdrop-)?blur(?:-[^\s"'`}>]+)?(?![\w-])|(?<![\w-])(?:[\w-]+:)*(?:drop|text)-shadow(?:-[^\s"'`}>]+)?(?![\w-])|\bblur\s*\(/g
      )
    );
  });

  test("uses only square or 2px control geometry", () => {
    expectNoViolations(
      "Replace rounded-md/lg/xl/2xl/3xl with rounded-[2px] or no radius.",
      violations(/(?<![\w-])(?:[\w-]+:)*rounded-(?:md|lg|xl|2xl|3xl)(?![\w-])/g)
    );
  });

  test("limits semantic circles to approved status, avatar, and timeline markers", () => {
    const approvedCircleFiles = new Set([
      "src/components/ui/StatusIndicator.tsx",
      "src/components/dashboard/SeniorAvatar.tsx",
      "src/components/dashboard/CaseDetails.tsx",
    ]);
    const findings = sources.flatMap((source) =>
      approvedCircleFiles.has(source.path)
        ? []
        : source.lines.flatMap((line, index) =>
            line.includes("rounded-full")
              ? [`${source.path}:${index + 1} contains "rounded-full"`]
              : []
          )
    );

    expectNoViolations(
      "Use rounded-full only for approved semantic circles, never general decoration.",
      findings
    );
  });

  test("uses no padded, filled rounded-full badges", () => {
    const classNamePattern =
      /className\s*=\s*(?:"[^"]*"|'[^']*'|\{\s*`[\s\S]*?`\s*\})/g;
    const findings = sources.flatMap((source) => {
      return [...source.content.matchAll(classNamePattern)].flatMap((match) => {
        const value = match[0];
        const hasBadgeGeometry =
          value.includes("rounded-full") &&
          /(?:^|\s)(?:[\w-]+:)*(?:px|py)-[^\s"'`}>]+/.test(value) &&
          /(?:^|\s)(?:[\w-]+:)*bg-[^\s"'`}>]+/.test(value);
        if (!hasBadgeGeometry) return [];
        const line = source.content.slice(0, match.index).split("\n").length;
        return [`${source.path}:${line} combines rounded-full, padding, and fill`];
      });
    });

    expectNoViolations(
      "Replace filled pill badges with flat text or approved semantic indicators.",
      findings
    );
  });
});
