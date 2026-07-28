"use client";

import {
  useEffect,
  useRef,
  useState,
  type KeyboardEvent,
} from "react";
import type { ProactiveCheckInScheduleOverview } from "@/lib/checkins/contracts";
import type { SeniorContextReadModel } from "@/lib/api/schemas";
import type { MaskedContactPlan } from "@/lib/types";
import { ContactPlanPanel, contactPlanInstanceKey } from "./ContactPlanPanel";
import { ProactiveCheckInPanel } from "./ProactiveCheckInPanel";
import { SeniorContextPanel } from "./SeniorContextPanel";

type CareSetupTab = "context" | "check-ins" | "contacts";

interface CareSetupDrawerProps {
  open: boolean;
  onClose: () => void;
  selectedSeniorId: string | null;
  authToken: string;
  isAdmin: boolean;
  seniorContext: SeniorContextReadModel | null;
  seniorContextLoading: boolean;
  seniorContextError: string | null;
  onSeniorContextChanged: (context: SeniorContextReadModel) => void;
  contactPlan: MaskedContactPlan | null;
  contactPlanLoading: boolean;
  contactPlanError: string | null;
  onRefreshContactPlan: () => void;
  checkInSchedule: ProactiveCheckInScheduleOverview | null;
  checkInScheduleLoading: boolean;
  checkInScheduleError: string | null;
  onRefreshCheckInSchedule: () => void;
  onUnauthorized: () => void;
}

const tabs: Array<{ id: CareSetupTab; label: string }> = [
  { id: "context", label: "Context" },
  { id: "check-ins", label: "Check-ins" },
  { id: "contacts", label: "Contacts" },
];

const focusableSelector =
  'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

export function CareSetupDrawer(props: CareSetupDrawerProps) {
  const [activeTab, setActiveTab] = useState<CareSetupTab>("context");
  const dialogRef = useRef<HTMLElement>(null);
  const activeTabRef = useRef(activeTab);
  const openerRef = useRef<HTMLElement | null>(null);
  const onCloseRef = useRef(props.onClose);
  const tabRefs = useRef<Record<CareSetupTab, HTMLButtonElement | null>>({
    context: null,
    "check-ins": null,
    contacts: null,
  });

  useEffect(() => {
    activeTabRef.current = activeTab;
  }, [activeTab]);

  useEffect(() => {
    onCloseRef.current = props.onClose;
  }, [props.onClose]);

  useEffect(() => {
    if (!props.open) return;
    openerRef.current =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;
    tabRefs.current[activeTabRef.current]?.focus();

    const onDocumentKeyDown = (event: globalThis.KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      onCloseRef.current();
    };
    document.addEventListener("keydown", onDocumentKeyDown);

    return () => {
      document.removeEventListener("keydown", onDocumentKeyDown);
      openerRef.current?.focus();
      openerRef.current = null;
    };
  }, [props.open]);

  if (!props.open) return null;

  function trapFocus(event: KeyboardEvent<HTMLElement>) {
    if (event.key !== "Tab") return;
    const focusable = Array.from(
      dialogRef.current?.querySelectorAll<HTMLElement>(focusableSelector) ?? []
    );
    if (focusable.length === 0) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }

  return (
    <div className="fixed inset-0 z-40 flex justify-end bg-black/25">
      <button
        type="button"
        aria-label="Close care setup"
        tabIndex={-1}
        className="absolute inset-0 cursor-default"
        onClick={props.onClose}
      />
      <section
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="care-setup-title"
        onKeyDown={trapFocus}
        className="relative z-10 flex h-full w-full max-w-2xl flex-col border-l border-[var(--care-line)] bg-[var(--care-paper)] shadow-[-8px_0_24px_rgba(23,33,29,0.14)]"
      >
        <div className="flex min-h-16 items-center justify-between border-b border-[var(--care-line)] px-4 sm:px-6">
          <h2 id="care-setup-title" className="font-display text-xl font-semibold text-gray-950">
            Care setup
          </h2>
          <button
            type="button"
            onClick={props.onClose}
            className="min-h-11 border border-gray-300 px-3 py-2 text-sm font-semibold text-gray-800 hover:border-[var(--care-evergreen)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--care-brand)]"
          >
            Close
          </button>
        </div>
        <div
          role="tablist"
          aria-label="Care setup sections"
          className="grid grid-cols-3 border-b border-[var(--care-line)] bg-white"
        >
          {tabs.map((tab) => {
            const selected = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                ref={(element) => {
                  tabRefs.current[tab.id] = element;
                }}
                id={`care-setup-${tab.id}-tab`}
                type="button"
                role="tab"
                aria-selected={selected}
                aria-controls={`care-setup-${tab.id}-panel`}
                tabIndex={selected ? 0 : -1}
                onClick={() => setActiveTab(tab.id)}
                className={`min-h-11 border-b-2 px-3 py-3 text-sm font-semibold focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-[var(--care-brand)] ${
                  selected
                    ? "border-[var(--care-coral)] text-gray-950"
                    : "border-transparent text-gray-600"
                }`}
              >
                {tab.label}
              </button>
            );
          })}
        </div>
        <div
          id={`care-setup-${activeTab}-panel`}
          role="tabpanel"
          aria-labelledby={`care-setup-${activeTab}-tab`}
          className="min-h-0 flex-1 overflow-y-auto p-4 sm:p-6 [&>details]:rounded-none [&>details]:border-x-0 [&>details]:shadow-none [&>section]:rounded-none [&>section]:border-x-0 [&>section]:shadow-none"
        >
          {activeTab === "context" && (
            <SeniorContextPanel
              key={`senior-context:${props.selectedSeniorId ?? "none"}`}
              context={props.seniorContext}
              loading={props.seniorContextLoading}
              error={props.seniorContextError}
              isAdmin={props.isAdmin}
              seniorId={props.selectedSeniorId}
              authToken={props.authToken}
              onChanged={props.onSeniorContextChanged}
              onUnauthorized={props.onUnauthorized}
            />
          )}
          {activeTab === "check-ins" && (
            <ProactiveCheckInPanel
              key={`proactive-check-in:${props.selectedSeniorId ?? "none"}`}
              overview={props.checkInSchedule}
              loading={props.checkInScheduleLoading}
              error={props.checkInScheduleError}
              isAdmin={props.isAdmin}
              seniorId={props.selectedSeniorId}
              authToken={props.authToken}
              onSaved={props.onRefreshCheckInSchedule}
              onUnauthorized={props.onUnauthorized}
            />
          )}
          {activeTab === "contacts" && (
            <ContactPlanPanel
              key={contactPlanInstanceKey(props.selectedSeniorId)}
              plan={props.contactPlan}
              loading={props.contactPlanLoading}
              error={props.contactPlanError}
              isAdmin={props.isAdmin}
              seniorId={props.selectedSeniorId}
              authToken={props.authToken}
              onSaved={props.onRefreshContactPlan}
              onUnauthorized={props.onUnauthorized}
            />
          )}
        </div>
      </section>
    </div>
  );
}
