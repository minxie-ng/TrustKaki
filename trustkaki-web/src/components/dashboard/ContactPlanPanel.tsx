"use client";

import { useRef, useState } from "react";
import { authHeader } from "@/lib/auth/client";
import type { NotificationCategory } from "@/lib/contacts/contracts";
import type { RecipientSelectionResult } from "@/lib/contacts/contracts";
import type { MaskedContactMethod, MaskedContactPlan } from "@/lib/types";

export function contactPlanPresentation(plan: MaskedContactPlan, isAdmin: boolean) {
  const contact = [...plan.contacts]
    .filter((item) => item.active)
    .sort((a, b) => a.escalationPriority - b.escalationPriority)[0];
  const method = contact?.methods
    .filter((item) => item.active)
    .sort((a, b) => a.methodPriority - b.methodPriority)[0];
  const quiet = method?.quietHoursStart && method.quietHoursEnd
    ? `Quiet hours ${method.quietHoursStart}–${method.quietHoursEnd}`
    : "No quiet hours configured";
  return {
    canEdit: isAdmin,
    primaryContact: contact
      ? `${contact.displayName} · ${contact.relationship}`
      : "No contact plan configured",
    primaryMethod: method
      ? `${method.channel === "whatsapp" ? "WhatsApp" : method.channel} · ${method.maskedDestination}`
      : "No verified method configured",
    availability: method
      ? `${quiet}${method.consent?.allowUrgentQuietHours ? " · urgent override allowed" : ""}`
      : "Staff configuration required",
  };
}

export function contactPlanInstanceKey(seniorId: string | null) {
  return `contact-plan:${seniorId ?? "none"}`;
}

export function contactMethodHelpId(contactId: string): string {
  return `whatsapp-number-help-${contactId}`;
}

export function isValidWhatsAppDestination(value: string): boolean {
  const normalized = value.trim().replace(/[\s().-]/g, "");
  return /^\+[1-9]\d{7,14}$/.test(normalized);
}

export function nextContactPriority(
  plan: MaskedContactPlan | null | undefined,
  contactKind: MaskedContactPlan["contacts"][number]["contactKind"]
) {
  const priorities = (plan?.contacts ?? [])
    .filter((contact) => contact.active && contact.contactKind === contactKind)
    .map((contact) => contact.escalationPriority);
  return Math.max(0, ...priorities) + 1;
}

export function nextMethodPriority(
  contact: MaskedContactPlan["contacts"][number]
): number {
  return Math.max(0, ...contact.methods.map((method) => method.methodPriority)) + 1;
}

const recipientReasonLabels = {
  inactive_contact: "the contact is inactive",
  inactive_method: "the contact method is inactive",
  destination_mismatch: "the contact does not match this alert destination",
  channel_mismatch: "the requested contact channel is unavailable",
  unverified_method: "the contact method is not verified",
  consent_missing: "notification consent is not recorded",
  consent_revoked: "notification consent was revoked",
  consent_expired: "notification consent has expired",
  category_not_permitted: "consent does not cover this alert",
  quiet_hours: "quiet hours are active",
} as const;

export function recipientPreviewPresentation(
  decision: RecipientSelectionResult,
  plan: MaskedContactPlan
) {
  if (decision.result === "candidate_selected") return decision.explanation;
  if (decision.skippedReasons.length === 0) return decision.explanation;
  return decision.skippedReasons.map((skipped) => {
    const contact = plan.contacts.find((item) => item.id === skipped.contactId);
    const method = contact?.methods.find((item) => item.id === skipped.methodId);
    const identity = contact && method
      ? `${contact.displayName} (${method.channel === "whatsapp" ? "WhatsApp" : method.channel} · ${method.maskedDestination})`
      : "Configured contact";
    const reasons = skipped.reasonCodes.map((reason) => recipientReasonLabels[reason]);
    return `${identity} was excluded: ${reasons.join("; ")}.`;
  }).join(" ");
}

interface ContactPlanPanelProps {
  plan: MaskedContactPlan | null;
  loading: boolean;
  error: string | null;
  isAdmin: boolean;
  seniorId: string | null;
  authToken: string;
  onSaved: () => void;
  onUnauthorized: () => void;
}

async function sendCommand(args: {
  url: string;
  method: "POST" | "PATCH";
  body: Record<string, unknown>;
  authToken: string;
  onUnauthorized: () => void;
}) {
  const response = await fetch(args.url, {
    method: args.method,
    headers: { "Content-Type": "application/json", ...authHeader(args.authToken) },
    body: JSON.stringify(args.body),
  });
  if (response.status === 401) args.onUnauthorized();
  if (!response.ok) throw new Error(response.status === 409 ? "conflict" : "failed");
  return response.json();
}

export function ContactPlanPanel(props: ContactPlanPanelProps) {
  const empty = { seniorId: props.seniorId ?? "", contacts: [] };
  const view = contactPlanPresentation(props.plan ?? empty, props.isAdmin);
  const [showAdmin, setShowAdmin] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [relationship, setRelationship] = useState("");
  const [kind, setKind] = useState<MaskedContactPlan["contacts"][number]["contactKind"]>("family_guardian");
  const commandRef = useRef<string | null>(null);

  async function createContact() {
    if (!props.seniorId || !name.trim() || !relationship.trim() || busy) return;
    const commandId = commandRef.current ?? crypto.randomUUID();
    commandRef.current = commandId;
    setBusy(true);
    setMessage(null);
    try {
      await sendCommand({
        url: `/api/admin/seniors/${props.seniorId}/contacts`,
        method: "POST",
        authToken: props.authToken,
        onUnauthorized: props.onUnauthorized,
        body: {
          commandId,
          displayName: name,
          relationship,
          contactKind: kind,
          preferredLanguage: "en",
          timezone: "Asia/Singapore",
          escalationPriority: nextContactPriority(props.plan, kind),
        },
      });
      commandRef.current = null;
      setName("");
      setRelationship("");
      setMessage("Contact added.");
      props.onSaved();
    } catch (error) {
      setMessage(error instanceof Error && error.message === "conflict"
        ? "The contact plan changed. Refresh and try again."
        : "Could not save the contact. Please retry.");
    } finally {
      setBusy(false);
    }
  }

  async function previewRecipient() {
    if (!props.seniorId || busy) return;
    setBusy(true);
    setPreview(null);
    try {
      const result = await sendCommand({
        url: `/api/admin/seniors/${props.seniorId}/recipient-preview`,
        method: "POST",
        authToken: props.authToken,
        onUnauthorized: props.onUnauthorized,
        body: {
          category: "health_safety",
          destination: "family_guardian",
          evaluationTime: new Date().toISOString(),
          requestedChannel: "whatsapp",
        },
      }) as { recipientDecision?: RecipientSelectionResult };
      setPreview(result.recipientDecision
        ? recipientPreviewPresentation(result.recipientDecision, props.plan ?? empty)
        : "No eligible contact found.");
    } catch {
      setPreview("Preview unavailable. Please retry.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="rounded-lg border border-[var(--care-line)] border-l-[3px] border-l-[var(--care-brand)] bg-white p-4 shadow-[0_3px_12px_rgba(23,33,29,0.04)] transition-colors hover:border-[var(--care-teal-line)] hover:border-l-[var(--care-brand)]">
      <div className="-mx-4 -mt-4 mb-4 border-b border-[var(--care-line)] bg-[var(--care-surface-muted)] px-4 py-3 text-sm font-bold text-[var(--care-brand)]">
        Contact plan
      </div>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-lg font-bold text-gray-950">{view.primaryContact}</h3>
          <p className="mt-1 text-sm text-gray-700">
            {props.loading ? "Loading contact plan..." : view.primaryMethod}
          </p>
          <p className="mt-1 text-xs text-gray-500">{props.error ?? view.availability}</p>
        </div>
        {props.isAdmin && (
          <button type="button" onClick={() => setShowAdmin((value) => !value)}
            className="rounded-lg border border-gray-300 px-3 py-2 text-sm font-semibold text-gray-800">
            {showAdmin ? "Hide contact settings" : "Manage contact plan"}
          </button>
        )}
      </div>

      <details className="mt-4 text-sm">
        <summary className="cursor-pointer font-semibold text-gray-700">View contact order</summary>
        <div className="mt-3 space-y-3">
          {(props.plan?.contacts ?? []).map((contact) => (
            <div key={contact.id} className="rounded-lg bg-gray-50 p-3">
              <div className="font-semibold text-gray-900">
                {contact.escalationPriority}. {contact.displayName} · {contact.relationship}
              </div>
              {contact.methods.map((method) => (
                <div key={method.id} className="mt-1 text-gray-600">
                  {method.channel} · {method.maskedDestination} · {method.verificationStatus}
                  {method.consent?.eventType === "granted"
                    ? ` · ${method.consent.categories.join(", ")}`
                    : " · no active consent"}
                  {props.isAdmin && showAdmin && (
                    <MethodAdminControls
                      method={method}
                      authToken={props.authToken}
                      onSaved={props.onSaved}
                      onUnauthorized={props.onUnauthorized}
                    />
                  )}
                </div>
              ))}
              {props.isAdmin && showAdmin && (
                <AddMethodForm
                  contactId={contact.id}
                  methodPriority={nextMethodPriority(contact)}
                  authToken={props.authToken}
                  onSaved={props.onSaved}
                  onUnauthorized={props.onUnauthorized}
                />
              )}
            </div>
          ))}
        </div>
      </details>

      {props.isAdmin && showAdmin && (
        <div className="mt-5 border-t border-gray-200 pt-4">
          <h4 className="font-semibold text-gray-900">Add contact</h4>
          <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <input value={name} onChange={(event) => { commandRef.current = null; setName(event.target.value); }} placeholder="Contact name" className="rounded-lg border px-3 py-2" />
            <input value={relationship} onChange={(event) => { commandRef.current = null; setRelationship(event.target.value); }} placeholder="Relationship" className="rounded-lg border px-3 py-2" />
            <select value={kind} onChange={(event) => { commandRef.current = null; setKind(event.target.value as MaskedContactPlan["contacts"][number]["contactKind"]); }} className="rounded-lg border px-3 py-2">
              <option value="family_guardian">Family or guardian</option>
              <option value="aac_staff">AAC staff</option>
              <option value="healthcare_contact">Healthcare contact</option>
            </select>
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            <button type="button" onClick={createContact} disabled={busy || !name.trim() || !relationship.trim()} className="rounded-lg bg-[var(--care-brand-strong)] px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-[var(--care-brand-hover)] disabled:opacity-50">
              {busy ? "Saving..." : "Add contact"}
            </button>
            <button type="button" onClick={previewRecipient} disabled={busy || !props.plan?.contacts.length} className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-semibold disabled:opacity-50">
              Preview family alert
            </button>
          </div>
          {(message || preview) && <p className="mt-3 text-sm text-gray-700">{message ?? preview}</p>}
        </div>
      )}
    </section>
  );
}

function AddMethodForm(props: {
  contactId: string;
  methodPriority: number;
  authToken: string;
  onSaved: () => void;
  onUnauthorized: () => void;
}) {
  const helpId = contactMethodHelpId(props.contactId);
  const [open, setOpen] = useState(false);
  const [destination, setDestination] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const commandRef = useRef<string | null>(null);
  async function submit() {
    if (!destination.trim() || busy) return;
    if (!isValidWhatsAppDestination(destination)) {
      setError("Enter a WhatsApp number in international format, for example +6581234567.");
      return;
    }
    setBusy(true);
    setError(null);
    const commandId = commandRef.current ?? crypto.randomUUID();
    commandRef.current = commandId;
    try {
      await sendCommand({
        url: `/api/admin/contacts/${props.contactId}/methods`, method: "POST",
        authToken: props.authToken, onUnauthorized: props.onUnauthorized,
        body: {
          commandId, channel: "whatsapp", destination, methodPriority: props.methodPriority,
          timezone: "Asia/Singapore", quietHoursStart: "22:00", quietHoursEnd: "07:00",
        },
      });
      commandRef.current = null;
      setDestination("");
      setOpen(false);
      props.onSaved();
    } catch (cause) {
      setError(
        cause instanceof Error && cause.message === "conflict"
          ? "The contact plan changed. Refresh and try again."
          : "Could not save the WhatsApp method. Check the number format and try again."
      );
    } finally {
      setBusy(false);
    }
  }
  if (!open) return <button type="button" onClick={() => setOpen(true)} className="mt-2 text-xs font-semibold text-[var(--care-brand)] hover:text-[var(--care-brand-hover)]">Add WhatsApp method</button>;
  return (
    <div className="mt-2">
      <div className="flex flex-wrap gap-2">
        <input
          value={destination}
          onChange={(event) => {
            commandRef.current = null;
            setDestination(event.target.value);
            setError(null);
          }}
          placeholder="+65 8123 4567"
          inputMode="tel"
          aria-label="WhatsApp number"
          aria-invalid={Boolean(error)}
          aria-describedby={helpId}
          className="rounded border px-2 py-1"
        />
        <button type="button" disabled={busy} onClick={submit} className="rounded bg-[var(--care-brand-strong)] px-3 py-1 text-xs font-semibold text-white hover:bg-[var(--care-brand-hover)]">Save</button>
      </div>
      <p id={helpId} className="mt-1 text-xs text-gray-500">
        Use international format, for example +6581234567.
      </p>
      {error && <p className="mt-1 text-xs font-semibold text-red-700" role="alert">{error}</p>}
    </div>
  );
}

function MethodAdminControls(props: {
  method: MaskedContactMethod;
  authToken: string;
  onSaved: () => void;
  onUnauthorized: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const commandRef = useRef<string | null>(null);
  async function verifyAndConsent() {
    if (busy) return;
    setBusy(true);
    const now = new Date().toISOString();
    try {
      await sendCommand({
        url: `/api/admin/contact-methods/${props.method.id}`, method: "PATCH",
        authToken: props.authToken, onUnauthorized: props.onUnauthorized,
        body: {
          commandId: crypto.randomUUID(), expectedUpdatedAt: props.method.updatedAt,
          channel: props.method.channel, destination: null,
          verificationStatus: "verified", verificationMethod: "admin_confirmed",
          verifiedAt: now, methodPriority: props.method.methodPriority,
          timezone: props.method.timezone, quietHoursStart: props.method.quietHoursStart,
          quietHoursEnd: props.method.quietHoursEnd, active: props.method.active,
        },
      });
      const commandId = commandRef.current ?? crypto.randomUUID();
      commandRef.current = commandId;
      await sendCommand({
        url: `/api/admin/contact-methods/${props.method.id}/consent`, method: "POST",
        authToken: props.authToken, onUnauthorized: props.onUnauthorized,
        body: {
          commandId, eventType: "granted",
          categories: ["wellbeing_follow_up", "health_safety", "digital_safety", "urgent_safety"] satisfies NotificationCategory[],
          allowUrgentQuietHours: true, confirmationMethod: "verbal", confirmedAt: now,
          note: "Consent confirmed directly with the contact by an administrator.",
        },
      });
      commandRef.current = null;
      props.onSaved();
    } finally {
      setBusy(false);
    }
  }
  return (
    <button type="button" onClick={verifyAndConsent} disabled={busy} className="ml-2 text-xs font-semibold text-[var(--care-brand)] hover:text-[var(--care-brand-hover)] disabled:opacity-50">
      {busy ? "Saving..." : "Verify and record consent"}
    </button>
  );
}
