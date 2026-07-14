import type { Metadata } from "next";
import { LegalDocument } from "@/components/LegalDocument";

export const metadata: Metadata = {
  title: "Privacy Policy | TrustKaki",
  description: "How TrustKaki handles senior, caregiver, and WhatsApp data.",
};

export default function PrivacyPage() {
  return (
    <LegalDocument
      eyebrow="Privacy policy"
      title="TrustKaki Privacy Policy"
      updated="14 July 2026"
      introduction="TrustKaki is an AI-assisted senior engagement and caregiver decision-support service. This policy explains what information TrustKaki handles, why it is used, and the choices available to seniors and caregivers."
    >
      <section>
        <h2>Who this policy applies to</h2>
        <p>
          This policy applies to seniors who communicate with TrustKaki, their
          authorised family members and caregivers, AAC staff or volunteers, and
          administrators of participating care organisations. The organisation
          that enrols a senior remains responsible for defining authorised users
          and appropriate care workflows.
        </p>
      </section>

      <section>
        <h2>Information we handle</h2>
        <ul>
          <li>Identity and contact details, including names, phone numbers, age, address, and caregiver relationships.</li>
          <li>WhatsApp messages, check-in responses, delivery information, and conversation timestamps.</li>
          <li>Care context voluntarily supplied by the senior or authorised care team, including routines, preferences, mobility, wellbeing, and health-related context.</li>
          <li>Detected signals, pattern observations, policy risk events, briefings, follow-up cases, assignments, and caregiver-recorded outcomes.</li>
          <li>Operational and security records such as authenticated actions, agent runs, request identifiers, errors, and audit history.</li>
        </ul>
      </section>

      <section>
        <h2>How information is used</h2>
        <ul>
          <li>Provide personalised check-ins and respond to senior messages.</li>
          <li>Identify changes over time that may merit human follow-up.</li>
          <li>Help authorised caregivers coordinate, document, and resolve follow-up work.</li>
          <li>Protect service reliability, prevent duplicate processing, investigate incidents, and improve safety.</li>
          <li>Meet legal, safeguarding, and organisational accountability requirements.</li>
        </ul>
      </section>

      <section>
        <h2>AI assistance and human oversight</h2>
        <p>
          TrustKaki uses specialist AI agents to interpret messages and prepare
          suggested replies or summaries. Safety-critical risk transitions and
          alert decisions are controlled by deterministic policy rules. AI output
          supports, but does not replace, caregiver judgement. TrustKaki does not
          provide medical diagnosis, does not guarantee scam detection, and does
          not provide emergency response. In an emergency, contact local emergency
          services or an appropriate human responder directly.
        </p>
      </section>

      <section>
        <h2>Service providers and disclosure</h2>
        <p>
          Information may be processed by authorised care organisations and the
          providers needed to operate TrustKaki, including Meta for WhatsApp
          messaging, hosting and database providers, and configured AI model
          providers. Access is limited to the service purpose and applicable
          contractual or organisational controls. TrustKaki does not sell personal
          information or use senior conversations for advertising.
        </p>
      </section>

      <section>
        <h2>Retention and security</h2>
        <p>
          Information is retained only while needed for care operations, audit,
          safeguarding, legal obligations, and the participating organisation&apos;s
          approved retention policy. TrustKaki uses access controls, encrypted
          connections, server-side secrets, audit records, and database security
          policies. No system is completely secure, and participating organisations
          must manage staff access and devices responsibly.
        </p>
      </section>

      <section>
        <h2>Your choices</h2>
        <p>
          Seniors and authorised representatives may ask to access, correct, export,
          restrict, or delete relevant information, subject to identity checks and
          any safeguarding or legal retention requirement. See the{" "}
          <a href="/data-deletion">access and deletion instructions</a>.
          WhatsApp users may also stop messaging TrustKaki or ask the participating
          organisation to withdraw them from future check-ins.
        </p>
      </section>

      <section>
        <h2>Questions and complaints</h2>
        <p>
          Contact the participating care organisation or TrustKaki administrator
          identified during enrolment. They can identify the responsible data
          controller, record the request, and escalate privacy or safeguarding
          concerns through the organisation&apos;s approved process.
        </p>
      </section>

      <section>
        <h2>Changes to this policy</h2>
        <p>
          We may update this policy as TrustKaki&apos;s services or legal obligations
          change. The current version and effective date will remain available on
          this page.
        </p>
      </section>
    </LegalDocument>
  );
}
