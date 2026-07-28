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

function fixture(filePath: string, content: string): SourceFile {
  return { path: filePath, content, lines: content.split("\n") };
}

interface ClassNameOccurrence {
  value: string;
  element: string;
  line: number;
}

const classNamePattern =
  /className\s*=\s*(?:"[^"]*"|'[^']*'|\{\s*`[\s\S]*?`\s*\})/g;

function normalizedClassName(attribute: string): string {
  const assignment = attribute.slice(attribute.indexOf("=") + 1).trim();
  const value = assignment.startsWith("{`")
    ? assignment.slice(2, -2)
    : assignment.slice(1, -1);
  return value.replace(/\s+/g, " ").trim();
}

function classNameOccurrences(source: SourceFile): ClassNameOccurrence[] {
  return [...source.content.matchAll(classNamePattern)].map((match) => {
    const start = match.index;
    const elementStart = source.content.lastIndexOf("<", start);
    const elementEnd = source.content.indexOf(">", start + match[0].length);
    return {
      value: normalizedClassName(match[0]),
      element: source.content
        .slice(elementStart, elementEnd === -1 ? start + match[0].length : elementEnd + 1)
        .replace(/\s+/g, " "),
      line: source.content.slice(0, start).split("\n").length,
    };
  });
}

const semanticCircleAllowlist = [
  {
    path: "src/components/ui/StatusIndicator.tsx",
    value: "h-2 w-2 shrink-0 rounded-full ${dotClass[tone]}",
    elementToken: 'data-status-dot="true"',
    label: "StatusIndicator status dot",
  },
  {
    path: "src/components/dashboard/SeniorAvatar.tsx",
    value:
      "relative grid aspect-square shrink-0 place-items-center overflow-hidden rounded-full border border-[var(--care-line)] bg-[var(--care-soft-teal)] font-bold text-[var(--care-brand)]",
    elementToken: "style={{ width: pixels, height: pixels }}",
    label: "SeniorAvatar image frame",
  },
  {
    path: "src/components/dashboard/CaseDetails.tsx",
    value: "absolute -left-1 top-1 h-2 w-2 rounded-full ${markerClass}",
    elementToken: 'aria-hidden="true"',
    label: "care-thread evidence or timeline marker",
  },
] as const;

function semanticCircleViolations(input: SourceFile[]): string[] {
  const allowedCounts = new Map<string, number>();
  return input.flatMap((source) =>
    classNameOccurrences(source).flatMap((occurrence) => {
      if (!occurrence.value.includes("rounded-full")) return [];
      const rule = semanticCircleAllowlist.find(
        (candidate) =>
          candidate.path === source.path &&
          candidate.value === occurrence.value &&
          occurrence.element.includes(candidate.elementToken)
      );
      if (!rule) {
        return [
          `${source.path}:${occurrence.line} uses unapproved rounded-full geometry ${JSON.stringify(occurrence.value)}`,
        ];
      }
      const key = `${rule.path}:${rule.label}`;
      const count = (allowedCounts.get(key) ?? 0) + 1;
      allowedCounts.set(key, count);
      return count === 1
        ? []
        : [`${source.path}:${occurrence.line} duplicates the allowed ${rule.label}`];
    })
  );
}

function paddedCircleViolations(input: SourceFile[]): string[] {
  return input.flatMap((source) => {
    return classNameOccurrences(source).flatMap((occurrence) => {
      if (!occurrence.value.includes("rounded-full")) return [];
      const padding = occurrence.value.match(
        /(?:^|\s)((?:[\w-]+:)*(?:p|pl|pr|pt|pb|px|py)-[^\s]+)/
      )?.[1];
      return padding
        ? [
            `${source.path}:${occurrence.line} combines rounded-full with padded geometry ${JSON.stringify(padding)}`,
          ]
        : [];
    });
  });
}

describe("circle guard regressions", () => {
  test.each([
    {
      filePath: "src/components/ui/StatusIndicator.tsx",
      semanticCircle: `<span
  data-status-dot="true"
  className={\`h-2 w-2 shrink-0 rounded-full \${dotClass[tone]}\`}
/>`,
    },
    {
      filePath: "src/components/dashboard/SeniorAvatar.tsx",
      semanticCircle: `<span
  className="relative grid aspect-square shrink-0 place-items-center overflow-hidden rounded-full border border-[var(--care-line)] bg-[var(--care-soft-teal)] font-bold text-[var(--care-brand)]"
  style={{ width: pixels, height: pixels }}
/>`,
    },
    {
      filePath: "src/components/dashboard/CaseDetails.tsx",
      semanticCircle: `<span
  className={\`absolute -left-1 top-1 h-2 w-2 rounded-full \${markerClass}\`}
  aria-hidden="true"
/>`,
    },
  ])(
    "rejects an unrelated circle added to $filePath",
    ({ filePath, semanticCircle }) => {
      const approvedFile = fixture(
        filePath,
        `${semanticCircle}
<span
  className="
    h-4 w-4
    rounded-full
  "
/>`
      );

      const findings = semanticCircleViolations([approvedFile]);

      expect(findings).toHaveLength(1);
      expect(findings[0]).toContain(filePath);
    }
  );

  test("rejects every padded rounded-full geometry without requiring fill", () => {
    const paddingUtilities = ["p-2", "pl-2", "pr-2", "pt-2", "pb-2", "px-2", "py-2"];
    const fixtures = paddingUtilities.map((padding) =>
      fixture(
        `src/components/${padding.slice(0, -2)}Circle.tsx`,
        `<span
  className={\`
    rounded-full
    ${padding}
  \`}
/>`
      )
    );

    expect(paddedCircleViolations(fixtures)).toHaveLength(paddingUtilities.length);
  });
});

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
    expectNoViolations(
      "Use rounded-full only for approved semantic circles, never general decoration.",
      semanticCircleViolations(sources)
    );
  });

  test("uses no padded rounded-full geometry", () => {
    expectNoViolations(
      "Remove padding from rounded-full elements; use flat text or approved semantic indicators.",
      paddedCircleViolations(sources)
    );
  });
});
