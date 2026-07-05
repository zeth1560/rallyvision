import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import LegalPageLayout from '@/app/components/LegalPageLayout';
import { LEGAL_CONTACT_EMAIL, LEGAL_SITE_NAME } from '@/lib/legal-site';

export const metadata: Metadata = {
  title: `Privacy Policy | ${LEGAL_SITE_NAME}`,
  description: `How ${LEGAL_SITE_NAME} collects, uses, and protects your information.`,
};

function Section({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <section className="flex flex-col gap-3">
      <h2 className="text-xl font-semibold text-slate-950">{title}</h2>
      <div className="flex flex-col gap-3">{children}</div>
    </section>
  );
}

export default function PrivacyPolicyPage() {
  return (
    <LegalPageLayout title="Privacy Policy">
      <p>
        This Privacy Policy describes how {LEGAL_SITE_NAME} (&quot;we,&quot;
        &quot;us,&quot; or &quot;our&quot;) collects, uses, and shares
        information when you use our website, PlayerTrove, club replay services,
        and related features (collectively, the &quot;Services&quot;).
      </p>

      <Section title="Information we collect">
        <p>We may collect the following types of information:</p>
        <ul className="list-disc space-y-2 pl-6">
          <li>
            <strong>Contact information</strong>, such as your email address
            when you purchase clips, claim free access, request a PlayerTrove
            link, or contact us.
          </li>
          <li>
            <strong>Purchase and access information</strong>, such as clips you
            buy or claim, order history, promo code usage, download activity,
            and entitlements for optional add-ons like PB Vision analysis or Pro
            Review.
          </li>
          <li>
            <strong>Video-related information</strong>, including session and
            clip metadata (for example, court, club, recording time, and
            duration), thumbnails, and links to video files associated with your
            access.
          </li>
          <li>
            <strong>Payment information</strong>. Payments are processed by
            Stripe. We receive transaction details such as payment status and
            amounts, but we do not store full payment card numbers on our
            servers.
          </li>
          <li>
            <strong>Technical and usage information</strong>, such as browser
            type, device information, IP address, and logs related to site
            access, authentication links, downloads, and API requests.
          </li>
        </ul>
      </Section>

      <Section title="How we use information">
        <p>We use information to:</p>
        <ul className="list-disc space-y-2 pl-6">
          <li>Provide access to purchased, claimed, or assigned video clips</li>
          <li>Process payments, refunds, and promotional offers</li>
          <li>
            Deliver optional services you purchase, such as PB Vision analysis,
            Pro Review, or YouTube publishing where enabled
          </li>
          <li>
            Send transactional emails, including purchase confirmations,
            PlayerTrove access links, and service status updates
          </li>
          <li>Maintain security, prevent abuse, and troubleshoot issues</li>
          <li>Improve and operate the Services</li>
        </ul>
      </Section>

      <Section title="How we share information">
        <p>
          We do not sell your personal information. We may share information
          with service providers that help us operate the Services, including:
        </p>
        <ul className="list-disc space-y-2 pl-6">
          <li>
            <strong>Stripe</strong> for payment processing and refunds
          </li>
          <li>
            <strong>Amazon Web Services</strong> for secure video and asset
            storage
          </li>
          <li>
            <strong>Supabase</strong> for application data storage and
            authentication-related records
          </li>
          <li>
            <strong>Resend</strong> for email delivery
          </li>
          <li>
            <strong>PB Vision</strong> when you purchase or use PB Vision
            analysis, including your email address so you can access results in
            their platform
          </li>
          <li>
            Other vendors involved in hosting, analytics, or support as needed
            to deliver the Services
          </li>
        </ul>
        <p>
          We may also disclose information if required by law, to protect our
          rights or users, or in connection with a business transaction such as
          a merger or acquisition.
        </p>
      </Section>

      <Section title="Video content and third-party platforms">
        <p>
          Video footage may be recorded at participating clubs and made
          available to eligible users through {LEGAL_SITE_NAME}. If you choose
          optional integrations such as PB Vision or YouTube publishing, relevant
          video data and account identifiers may be shared with those providers
          to fulfill your request.
        </p>
        <p>
          Your use of third-party platforms is also subject to their own privacy
          policies and terms.
        </p>
      </Section>

      <Section title="Data retention">
        <p>
          We retain information for as long as needed to provide the Services,
          comply with legal obligations, resolve disputes, and enforce our
          agreements. Access to purchased or claimed clips may expire after a
          stated period, and some records may be kept longer for accounting,
          fraud prevention, or support purposes.
        </p>
      </Section>

      <Section title="Security">
        <p>
          We use reasonable administrative, technical, and organizational
          measures designed to protect information. No method of transmission or
          storage is completely secure, and we cannot guarantee absolute
          security.
        </p>
      </Section>

      <Section title="Your choices">
        <p>
          You may request access to or correction of certain information by
          contacting us. You can opt out of non-essential marketing emails if we
          send them. Transactional messages related to purchases and account
          access may still be sent as part of the Services.
        </p>
      </Section>

      <Section title="Children">
        <p>
          The Services are not directed to children under 13, and we do not
          knowingly collect personal information from children under 13. If you
          believe a child has provided us personal information, please contact
          us.
        </p>
      </Section>

      <Section title="Changes to this policy">
        <p>
          We may update this Privacy Policy from time to time. When we do, we
          will revise the &quot;Last updated&quot; date at the top of this page.
          Continued use of the Services after changes become effective means you
          accept the updated policy.
        </p>
      </Section>

      <Section title="Contact us">
        <p>
          If you have questions about this Privacy Policy or our data practices,
          contact us at{' '}
          <a
            href={`mailto:${LEGAL_CONTACT_EMAIL}`}
            className="font-medium text-slate-950 underline-offset-2 hover:underline"
          >
            {LEGAL_CONTACT_EMAIL}
          </a>
          .
        </p>
      </Section>
    </LegalPageLayout>
  );
}
