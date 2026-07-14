"use client";

import { useRef, useState } from "react";
import { authHeader } from "@/lib/auth/client";
import type { NotificationCategory } from "@/lib/contacts/contracts";
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
  const [kind, setKind] = useState("family_guardian");
  const [priority, setPriority] = useState("1");
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
          escalationPriority: Number(priority),
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
      }) as { recipientDecision?: { explanation?: string } };
      setPreview(result.recipientDecision?.explanation ?? "No eligible contact found.");
    } catch {
      setPreview("Preview unavailable. Please retry.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="text-xs font-semibold uppercase tracking-wide text-gray-500">Contact plan</div>
          <h3 className="mt-1 text-lg font-bold text-gray-950">{view.primaryContact}</h3>
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
          <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <input value={name} onChange={(event) => { commandRef.current = null; setName(event.target.value); }} placeholder="Contact name" className="rounded-lg border px-3 py-2" />
            <input value={relationship} onChange={(event) => { commandRef.current = null; setRelationship(event.target.value); }} placeholder="Relationship" className="rounded-lg border px-3 py-2" />
            <select value={kind} onChange={(event) => { commandRef.current = null; setKind(event.target.value); }} className="rounded-lg border px-3 py-2">
              <option value="family_guardian">Family or guardian</option>
              <option value="aac_staff">AAC staff</option>
              <option value="healthcare_contact">Healthcare contact</option>
            </select>
            <input type="number" min="1" value={priority} onChange={(event) => { commandRef.current = null; setPriority(event.target.value); }} aria-label="Escalation priority" className="rounded-lg border px-3 py-2" />
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            <button type="button" onClick={createContact} disabled={busy || !name.trim() || !relationship.trim()} className="rounded-lg bg-gray-900 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">
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
  authToken: string;
  onSaved: () => void;
  onUnauthorized: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [destination, setDestination] = useState("");
  const [busy, setBusy] = useState(false);
  const commandRef = useRef<string | null>(null);
  async function submit() {
    if (!destination.trim() || busy) return;
    setBusy(true);
    const commandId = commandRef.current ?? crypto.randomUUID();
    commandRef.current = commandId;
    try {
      await sendCommand({
        url: `/api/admin/contacts/${props.contactId}/methods`, method: "POST",
        authToken: props.authToken, onUnauthorized: props.onUnauthorized,
        body: {
          commandId, channel: "whatsapp", destination, methodPriority: 1,
          timezone: "Asia/Singapore", quietHoursStart: "22:00", quietHoursEnd: "07:00",
        },
      });
      commandRef.current = null;
      setDestination("");
      setOpen(false);
      props.onSaved();
    } finally {
      setBusy(false);
    }
  }
  if (!open) return <button type="button" onClick={() => setOpen(true)} className="mt-2 text-xs font-semibold text-emerald-700">Add WhatsApp method</button>;
  return (
    <div className="mt-2 flex gap-2">
      <input value={destination} onChange={(event) => { commandRef.current = null; setDestination(event.target.value); }} placeholder="WhatsApp number" className="rounded border px-2 py-1" />
      <button type="button" disabled={busy} onClick={submit} className="rounded bg-gray-900 px-3 py-1 text-xs font-semibold text-white">Save</button>
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
    <button type="button" onClick={verifyAndConsent} disabled={busy} className="ml-2 text-xs font-semibold text-emerald-700 disabled:opacity-50">
      {busy ? "Saving..." : "Verify and record consent"}
    </button>
  );
}
