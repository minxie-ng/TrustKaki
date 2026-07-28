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

function controlRadiusViolations(input: SourceFile[]): string[] {
  return input.flatMap((source) => {
    const utilityFindings = source.lines.flatMap((line, index) =>
      [
        ...line.matchAll(
          /(?<![\w-])(?:[\w-]+:)*rounded(?:-[^\s"'`}>;,]+)?(?![\w-])/g
        ),
      ].flatMap((match) => {
        const token = match[0];
        const utility = token.slice(token.lastIndexOf(":") + 1);
        return utility === "rounded-none" ||
          utility === "rounded-[2px]" ||
          utility === "rounded-full"
          ? []
          : [
              `${source.path}:${index + 1} contains ${JSON.stringify(token)}`,
            ];
      })
    );
    const fixedRadiusPattern = source.path.endsWith(".css")
      ? /\bborder-radius\s*:\s*([^;}\n]+)/g
      : source.path.endsWith(".tsx")
        ? /\bborderRadius\s*:\s*([^,}\n]+)/g
        : null;
    if (!fixedRadiusPattern) return utilityFindings;

    const fixedRadiusFindings = [
      ...source.content.matchAll(fixedRadiusPattern),
    ].flatMap((match) => {
      const rawValue = match[1].trim();
      const quote = rawValue[0];
      const isStaticString =
        source.path.endsWith(".tsx") &&
        (quote === '"' || quote === "'" || quote === "`") &&
        rawValue.at(-1) === quote;
      const value = isStaticString ? rawValue.slice(1, -1) : rawValue;
      const isAllowed = source.path.endsWith(".css")
        ? value === "0" || value === "0px" || value === "2px"
        : isStaticString
          ? value === "0" || value === "0px" || value === "2px"
          : value === "0" || value === "2";
      if (isAllowed) return [];

      const line = source.content.slice(0, match.index).split("\n").length;
      return [
        `${source.path}:${line} contains unapproved fixed radius ${JSON.stringify(rawValue)}`,
      ];
    });

    return [...utilityFindings, ...fixedRadiusFindings];
  });
}

interface ClassNameOccurrence {
  value: string;
  element: string;
  line: number;
  start: number;
  end: number;
}

interface CircleTokenOccurrence {
  index: number;
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
      start,
      end: start + match[0].length,
    };
  });
}

function circleTokenOccurrences(source: SourceFile): CircleTokenOccurrence[] {
  return [...source.content.matchAll(/(?<![\w-])rounded-full(?![\w-])/g)].map(
    (match) => ({
      index: match.index,
      line: source.content.slice(0, match.index).split("\n").length,
    })
  );
}

const semanticCircleAllowlist = [
  {
    path: "src/components/ui/StatusIndicator.tsx",
    requiredClassTokens: ["h-2", "w-2", "shrink-0", "rounded-full"],
    requiredClassTokenPatterns: [/^\$\{dotClass\[tone\]\}$/],
    elementTokens: ['data-status-dot="true"'],
    label: "StatusIndicator status dot",
    maxOccurrences: 1,
  },
  {
    path: "src/components/dashboard/SeniorAvatar.tsx",
    requiredClassTokens: [
      "relative",
      "grid",
      "aspect-square",
      "shrink-0",
      "place-items-center",
      "overflow-hidden",
      "rounded-full",
      "border",
      "border-[var(--care-line)]",
      "bg-[var(--care-soft-teal)]",
      "font-bold",
      "text-[var(--care-brand)]",
    ],
    requiredClassTokenPatterns: [],
    elementTokens: ["width: pixels", "height: pixels"],
    label: "SeniorAvatar image frame",
    maxOccurrences: 1,
  },
  {
    path: "src/components/dashboard/CaseDetails.tsx",
    requiredClassTokens: [
      "absolute",
      "-left-1",
      "top-1",
      "h-2",
      "w-2",
      "rounded-full",
    ],
    requiredClassTokenPatterns: [/^\$\{markerClass\}$/],
    elementTokens: ['aria-hidden="true"'],
    label: "care-thread evidence or timeline marker",
    maxOccurrences: 1,
  },
] as const;

function semanticCircleViolations(input: SourceFile[]): string[] {
  const allowedCounts = new Map<string, number>();
  return input.flatMap((source) => {
    const classNames = classNameOccurrences(source);
    return circleTokenOccurrences(source).flatMap((token) => {
      const occurrence = classNames.find(
        (candidate) => token.index >= candidate.start && token.index < candidate.end
      );
      const classTokens = new Set(occurrence?.value.split(/\s+/));
      const rule = semanticCircleAllowlist.find(
        (candidate) =>
          candidate.path === source.path &&
          candidate.requiredClassTokens.every((required) =>
            classTokens.has(required)
          ) &&
          candidate.requiredClassTokenPatterns.every((pattern) =>
            [...classTokens].some((classToken) => pattern.test(classToken))
          ) &&
          candidate.elementTokens.every((elementToken) =>
            occurrence?.element.includes(elementToken)
          )
      );
      if (!rule) {
        const context = occurrence
          ? ` in className ${JSON.stringify(occurrence.value)}`
          : "";
        return [
          `${source.path}:${token.line} uses unapproved "rounded-full" token${context}`,
        ];
      }
      const key = `${rule.path}:${rule.label}`;
      const count = (allowedCounts.get(key) ?? 0) + 1;
      allowedCounts.set(key, count);
      return count <= rule.maxOccurrences
        ? []
        : [`${source.path}:${token.line} duplicates the allowed ${rule.label}`];
    });
  });
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
    "rounded",
    "rounded-sm",
    "rounded-[3px]",
    "sm:rounded",
    "hover:rounded-sm",
    "md:focus:rounded-[4px]",
  ])("rejects non-2px control radius token %s", (radius) => {
    const source = fixture(
      "src/components/Control.tsx",
      `<button className="${radius}">Save</button>`
    );

    expect(controlRadiusViolations([source])).toHaveLength(1);
  });

  test.each([
    "rounded-[2px]",
    "sm:rounded-[2px]",
    "hover:rounded-[2px]",
  ])("allows exact 2px control radius token %s", (radius) => {
    const source = fixture(
      "src/components/Control.tsx",
      `<button className="${radius}">Save</button>`
    );

    expect(controlRadiusViolations([source])).toEqual([]);
  });

  test.each([
    {
      label: "CSS unitless zero",
      filePath: "src/components/control.css",
      content: ".control { border-radius: 0; }",
    },
    {
      label: "CSS zero pixels",
      filePath: "src/components/control.css",
      content: ".control { border-radius: 0px; }",
    },
    {
      label: "CSS exact two pixels",
      filePath: "src/components/control.css",
      content: ".control { border-radius: 2px; }",
    },
    {
      label: "JSX numeric zero",
      filePath: "src/components/Control.tsx",
      content: "<button style={{ borderRadius: 0 }}>Save</button>",
    },
    {
      label: "JSX zero pixels",
      filePath: "src/components/Control.tsx",
      content: '<button style={{ borderRadius: "0px" }}>Save</button>',
    },
    {
      label: "JSX numeric two pixels",
      filePath: "src/components/Control.tsx",
      content: "<button style={{ borderRadius: 2 }}>Save</button>",
    },
    {
      label: "JSX exact two pixels",
      filePath: "src/components/Control.tsx",
      content: '<button style={{ borderRadius: "2px" }}>Save</button>',
    },
  ])("allows $label control radius", ({ filePath, content }) => {
    expect(controlRadiusViolations([fixture(filePath, content)])).toEqual([]);
  });

  test.each([
    {
      label: "CSS three pixels",
      filePath: "src/components/control.css",
      content: ".control { border-radius: 3px; }",
    },
    {
      label: "CSS percentage",
      filePath: "src/components/control.css",
      content: ".control { border-radius: 50%; }",
    },
    {
      label: "CSS rem value",
      filePath: "src/components/control.css",
      content: ".control { border-radius: 0.25rem; }",
    },
    {
      label: "CSS multiple corners",
      filePath: "src/components/control.css",
      content: ".control { border-radius: 2px 2px; }",
    },
    {
      label: "CSS dynamic custom property",
      filePath: "src/components/control.css",
      content: ".control { border-radius: var(--control-radius); }",
    },
    {
      label: "JSX four pixels",
      filePath: "src/components/Control.tsx",
      content: '<button style={{ borderRadius: "4px" }}>Save</button>',
    },
    {
      label: "JSX percentage",
      filePath: "src/components/Control.tsx",
      content: '<button style={{ borderRadius: "50%" }}>Save</button>',
    },
    {
      label: "JSX rem value",
      filePath: "src/components/Control.tsx",
      content: '<button style={{ borderRadius: "0.25rem" }}>Save</button>',
    },
    {
      label: "JSX multiple corners",
      filePath: "src/components/Control.tsx",
      content: '<button style={{ borderRadius: "2px 2px" }}>Save</button>',
    },
    {
      label: "JSX dynamic identifier",
      filePath: "src/components/Control.tsx",
      content: "<button style={{ borderRadius: radius }}>Save</button>",
    },
    {
      label: "JSX dynamic function",
      filePath: "src/components/Control.tsx",
      content: "<button style={{ borderRadius: getRadius() }}>Save</button>",
    },
  ])("rejects $label control radius", ({ filePath, content }) => {
    expect(controlRadiusViolations([fixture(filePath, content)])).toHaveLength(1);
  });

  test("rejects rounded-full inside conditional helper className expressions", () => {
    const conditionalClass = fixture(
      "src/components/ConditionalCircle.tsx",
      `<span
  className={classes(
    "h-4 w-4",
    active && "rounded-full"
  )}
/>`
    );

    const findings = semanticCircleViolations([conditionalClass]);

    expect(findings).toHaveLength(1);
    expect(findings[0]).toContain("src/components/ConditionalCircle.tsx:4");
  });

  test("rejects rounded-full inside CSS apply rules", () => {
    const cssApply = fixture(
      "src/components/circle.css",
      `.status-marker {
  @apply h-4 w-4 rounded-full;
}`
    );

    const findings = semanticCircleViolations([cssApply]);

    expect(findings).toHaveLength(1);
    expect(findings[0]).toContain("src/components/circle.css:2");
  });

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

  test.each([
    {
      filePath: "src/components/ui/StatusIndicator.tsx",
      semanticCircle: `<span
  className={\`\${dotClass[tone]} rounded-full w-2 shrink-0 h-2\`}
  data-status-dot="true"
/>`,
    },
    {
      filePath: "src/components/dashboard/SeniorAvatar.tsx",
      semanticCircle: `<span
  style={{ width: pixels, height: pixels }}
  className="font-bold rounded-full grid aspect-square border shrink-0 text-[var(--care-brand)] relative overflow-hidden bg-[var(--care-soft-teal)] place-items-center border-[var(--care-line)]"
/>`,
    },
    {
      filePath: "src/components/dashboard/CaseDetails.tsx",
      semanticCircle: `<span
  aria-hidden="true"
  className={\`h-2 \${markerClass} absolute rounded-full top-1 w-2 -left-1\`}
/>`,
    },
  ])(
    "allows harmless semantic-circle class reordering in $filePath",
    ({ filePath, semanticCircle }) => {
      expect(
        semanticCircleViolations([fixture(filePath, semanticCircle)])
      ).toEqual([]);
    }
  );

  test("allows harmless SeniorAvatar style property reordering", () => {
    const source = fixture(
      "src/components/dashboard/SeniorAvatar.tsx",
      `<span
  className="relative grid aspect-square shrink-0 place-items-center overflow-hidden rounded-full border border-[var(--care-line)] bg-[var(--care-soft-teal)] font-bold text-[var(--care-brand)]"
  style={{ height: pixels, width: pixels }}
/>`
    );

    expect(semanticCircleViolations([source])).toEqual([]);
  });

  test("still rejects a duplicate approved semantic circle", () => {
    const semanticCircle = `<span
  data-status-dot="true"
  className={\`h-2 w-2 shrink-0 rounded-full \${dotClass[tone]}\`}
/>`;
    const source = fixture(
      "src/components/ui/StatusIndicator.tsx",
      `${semanticCircle}\n${semanticCircle}`
    );

    const findings = semanticCircleViolations([source]);

    expect(findings).toHaveLength(1);
    expect(findings[0]).toContain("duplicates the allowed StatusIndicator status dot");
  });

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
      "Use rounded-[2px] or no radius for controls.",
      controlRadiusViolations(sources)
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
