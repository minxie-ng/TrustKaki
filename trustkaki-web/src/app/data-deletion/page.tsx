import type { Metadata } from "next";
import { LegalDocument } from "@/components/LegalDocument";

export const metadata: Metadata = {
  title: "Access and Deletion | TrustKaki",
  description: "How to request access to or deletion of TrustKaki data.",
};

export default function DataDeletionPage() {
  return (
    <LegalDocument
      eyebrow="Data rights"
      title="Request access or deletion"
      updated="14 July 2026"
      introduction="A senior, caregiver, or authorised representative can request access to, correction of, or deletion of personal information handled through TrustKaki."
    >
      <section>
        <h2>How to make a request</h2>
        <ol className="space-y-3 [&_li]:ml-5 [&_li]:list-decimal">
          <li>Contact the participating care organisation or TrustKaki administrator identified during enrolment.</li>
          <li>State whether you are requesting access, correction, export, restriction, or deletion.</li>
          <li>Provide the senior&apos;s name and the WhatsApp number or care programme involved. Do not send passwords, one-time codes, or unnecessary medical information.</li>
          <li>The organisation will verify your identity and authority before disclosing or deleting information.</li>
        </ol>
      </section>

      <section>
        <h2>What happens next</h2>
        <p>
          The request will be recorded and reviewed by an authorised administrator.
          The organisation will explain the scope of available data, the action
          taken, and any information that must be retained for safeguarding, legal,
          security, or immutable audit requirements. Data held by service providers
          will be included where applicable to the request and the organisation&apos;s
          responsibilities.
        </p>
      </section>

      <section>
        <h2>WhatsApp messages</h2>
        <p>
          Removing TrustKaki records does not automatically remove copies retained
          by WhatsApp or on a user&apos;s own device. Those copies are governed by Meta&apos;s
          terms, the user&apos;s device settings, and the relevant account controls.
        </p>
      </section>

      <section>
        <h2>Need more information?</h2>
        <p>
          Read the <a href="/privacy">TrustKaki Privacy Policy</a> for details about
          the information handled, service providers, AI assistance, retention,
          security, and human oversight.
        </p>
      </section>
    </LegalDocument>
  );
}
