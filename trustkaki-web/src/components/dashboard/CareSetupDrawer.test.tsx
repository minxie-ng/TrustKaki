import { act, createElement } from "react";
import type { Root } from "react-dom/client";
// @ts-expect-error jsdom intentionally ships without TypeScript declarations.
import { JSDOM } from "jsdom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CareSetupDrawer } from "./CareSetupDrawer";

const props = {
  selectedSeniorId: "senior-1",
  authToken: "token",
  isAdmin: false,
  seniorContext: null,
  seniorContextLoading: false,
  seniorContextError: null,
  onSeniorContextChanged: vi.fn(),
  contactPlan: null,
  contactPlanLoading: false,
  contactPlanError: null,
  onRefreshContactPlan: vi.fn(),
  checkInSchedule: null,
  checkInScheduleLoading: false,
  checkInScheduleError: null,
  onRefreshCheckInSchedule: vi.fn(),
  onUnauthorized: vi.fn(),
};

let container: HTMLDivElement;
let root: Root;
let dom: JSDOM;

beforeEach(async () => {
  dom = new JSDOM("<!doctype html><html><body></body></html>");
  vi.stubGlobal("window", dom.window);
  vi.stubGlobal("document", dom.window.document);
  vi.stubGlobal("navigator", dom.window.navigator);
  vi.stubGlobal("HTMLElement", dom.window.HTMLElement);
  vi.stubGlobal("Event", dom.window.Event);
  vi.stubGlobal("KeyboardEvent", dom.window.KeyboardEvent);
  (globalThis as typeof globalThis & {
    IS_REACT_ACT_ENVIRONMENT: boolean;
  }).IS_REACT_ACT_ENVIRONMENT = true;
  container = document.createElement("div");
  document.body.append(container);
  const { createRoot } = await import("react-dom/client");
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  document.body.replaceChildren();
  dom.window.close();
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

function renderDrawer(
  onClose = vi.fn(),
  overrides: Partial<typeof props> = {}
) {
  act(() => {
    root.render(createElement(CareSetupDrawer, {
      ...props,
      ...overrides,
      open: true,
      onClose,
    }));
  });
  return onClose;
}

describe("care setup drawer", () => {
  it("uses the overlay and border without a drawer shadow", () => {
    renderDrawer();
    const overlay = container.firstElementChild as HTMLElement;
    const dialog = container.querySelector<HTMLElement>('[role="dialog"]')!;

    expect(overlay.className).toContain("bg-black/25");
    expect(dialog.className).toContain("border-l");
    expect(dialog.className).not.toContain("shadow-");
  });

  it("moves focus into the drawer and restores it on Escape", () => {
    const opener = document.createElement("button");
    opener.textContent = "Care setup";
    document.body.prepend(opener);
    opener.focus();
    const onClose = vi.fn(() => act(() => root.unmount()));

    renderDrawer(onClose);

    expect(document.activeElement?.getAttribute("role")).toBe("tab");
    act(() => {
      document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    });
    expect(onClose).toHaveBeenCalledOnce();
    expect(document.activeElement).toBe(opener);
  });

  it("provides labelled tabs for context, check-ins, and contacts", () => {
    renderDrawer();

    const tabs = Array.from(
      container.querySelectorAll<HTMLButtonElement>('[role="tab"]')
    );
    expect(tabs.map((tab) => tab.textContent)).toEqual([
      "Context",
      "Check-ins",
      "Contacts",
    ]);
    expect(tabs[0].getAttribute("aria-selected")).toBe("true");

    act(() => tabs[2].click());

    expect(tabs[2].getAttribute("aria-selected")).toBe("true");
    expect(
      container.querySelector('[role="tabpanel"]:not([hidden])')?.textContent
    ).toContain(
      "No contact plan configured"
    );
  });

  it("selects and focuses tabs with ArrowLeft, ArrowRight, Home, and End", () => {
    renderDrawer();
    const tabs = Array.from(
      container.querySelectorAll<HTMLButtonElement>('[role="tab"]')
    );

    const press = (tab: HTMLButtonElement, key: string) => {
      act(() => {
        tab.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true }));
      });
    };

    press(tabs[0], "ArrowRight");
    expect(tabs[1].getAttribute("aria-selected")).toBe("true");
    expect(document.activeElement).toBe(tabs[1]);

    press(tabs[1], "ArrowLeft");
    expect(tabs[0].getAttribute("aria-selected")).toBe("true");
    expect(document.activeElement).toBe(tabs[0]);

    press(tabs[0], "ArrowLeft");
    expect(tabs[2].getAttribute("aria-selected")).toBe("true");
    expect(document.activeElement).toBe(tabs[2]);

    press(tabs[2], "ArrowRight");
    expect(tabs[0].getAttribute("aria-selected")).toBe("true");
    expect(document.activeElement).toBe(tabs[0]);

    press(tabs[0], "End");
    expect(tabs[2].getAttribute("aria-selected")).toBe("true");
    expect(document.activeElement).toBe(tabs[2]);

    press(tabs[2], "Home");
    expect(tabs[0].getAttribute("aria-selected")).toBe("true");
    expect(document.activeElement).toBe(tabs[0]);
  });

  it("keeps contact drafts mounted while switching setup tabs", () => {
    renderDrawer(vi.fn(), { isAdmin: true });
    const tabs = Array.from(
      container.querySelectorAll<HTMLButtonElement>('[role="tab"]')
    );

    act(() => tabs[2].click());
    act(() => {
      Array.from(container.querySelectorAll<HTMLButtonElement>("button"))
        .find((button) => button.textContent === "Manage contact plan")!
        .click();
    });
    const nameInput =
      container.querySelector<HTMLInputElement>('input[placeholder="Contact name"]')!;
    act(() => {
      Object.getOwnPropertyDescriptor(
        dom.window.HTMLInputElement.prototype,
        "value"
      )!.set!.call(nameInput, "Daniel Lim");
      nameInput.dispatchEvent(new Event("input", { bubbles: true }));
    });
    expect(nameInput.value).toBe("Daniel Lim");

    act(() => tabs[0].click());
    expect(
      container.querySelector<HTMLElement>("#care-setup-contacts-panel")?.hidden
    ).toBe(true);
    act(() => tabs[2].click());

    expect(
      container.querySelector<HTMLInputElement>('input[placeholder="Contact name"]')
        ?.value
    ).toBe("Daniel Lim");
  });

  it("restores the original opener after changing setup tabs", () => {
    const opener = document.createElement("button");
    opener.textContent = "Care setup";
    document.body.prepend(opener);
    opener.focus();
    const onClose = vi.fn(() => act(() => root.unmount()));
    renderDrawer(onClose);
    const contacts = Array.from(
      container.querySelectorAll<HTMLButtonElement>('[role="tab"]')
    ).find((tab) => tab.textContent === "Contacts")!;

    act(() => contacts.click());
    act(() => {
      document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    });

    expect(document.activeElement).toBe(opener);
  });

  it("traps forward and reverse tab movement within the drawer", () => {
    renderDrawer();
    const dialog = container.querySelector<HTMLElement>('[role="dialog"]')!;
    const focusable = Array.from(
      dialog.querySelectorAll<HTMLElement>(
        'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
      )
    );
    const first = focusable[0];
    const last = focusable[focusable.length - 1];

    act(() => last.focus());
    act(() => {
      last.dispatchEvent(
        new KeyboardEvent("keydown", { key: "Tab", bubbles: true })
      );
    });
    expect(document.activeElement).toBe(first);

    act(() => first.focus());
    act(() => {
      first.dispatchEvent(
        new KeyboardEvent("keydown", {
          key: "Tab",
          shiftKey: true,
          bubbles: true,
        })
      );
    });
    expect(document.activeElement).toBe(last);
  });
});
