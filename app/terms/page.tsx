import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import LegalPageLayout from '@/app/components/LegalPageLayout';
import { LEGAL_CONTACT_EMAIL, LEGAL_SITE_NAME } from '@/lib/legal-site';

export const metadata: Metadata = {
  title: `Terms of Service | ${LEGAL_SITE_NAME}`,
  description: `Terms and conditions for using ${LEGAL_SITE_NAME} and PlayerTrove.`,
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

export default function TermsOfServicePage() {
  return (
    <LegalPageLayout title="Terms of Service">
      <p>
        These Terms of Service (&quot;Terms&quot;) govern your access to and use
        of {LEGAL_SITE_NAME}, PlayerTrove, and related websites, applications,
        and services (collectively, the &quot;Services&quot;) operated by us. By
        using the Services, you agree to these Terms.
      </p>

      <Section title="The Services">
        <p>
          {LEGAL_SITE_NAME} provides pickleball replay and video access services
          for players and participating clubs. Depending on the club, session,
          and products available, the Services may include instant replay
          access, clip or full-game purchases, HD downloads, optional add-ons
          such as PB Vision analysis or Pro Review, and related account features.
        </p>
        <p>
          Features, pricing, and availability may vary by club, court, session,
          or product and may change over time.
        </p>
      </Section>

      <Section title="Eligibility and accounts">
        <p>
          You must provide accurate information when purchasing, claiming, or
          accessing clips. PlayerTrove access is typically tied to the email
          address used at checkout or claim. You are responsible for maintaining
          access to that email account and for activity that occurs through links
          sent to it.
        </p>
      </Section>

      <Section title="Purchases, pricing, and payment">
        <p>
          Prices, promotions, and product availability are shown at checkout or
          on applicable session pages. Payments are processed through Stripe. By
          completing a purchase, you authorize us and our payment processor to
          charge the applicable fees, taxes, and discounts shown at checkout.
        </p>
        <p>
          All sales are subject to the product descriptions and access terms
          presented at the time of purchase, including any stated download or
          access expiration periods.
        </p>
      </Section>

      <Section title="Refunds">
        <p>
          Refund eligibility depends on the product purchased and the
          circumstances of the request. Where automated refunds apply, such as
          when a paid optional service like PB Vision cannot be delivered after
          multiple attempts, we will process refunds according to the rules
          displayed or communicated at purchase.
        </p>
        <p>
          Free claims, promotional offers, and successfully delivered digital
          goods may not be refundable except where required by law or explicitly
          stated otherwise.
        </p>
      </Section>

      <Section title="Video access and acceptable use">
        <p>You agree not to:</p>
        <ul className="list-disc space-y-2 pl-6">
          <li>
            Access clips or accounts you are not authorized to use
          </li>
          <li>
            Share secure access links in a way that allows unauthorized third
            parties to download or use paid content
          </li>
          <li>
            Copy, redistribute, publicly perform, or commercially exploit video
            content except as permitted by your purchase or applicable law
          </li>
          <li>
            Interfere with the Services, attempt unauthorized access, or misuse
            APIs or download endpoints
          </li>
          <li>
            Use the Services in violation of applicable law or club rules
          </li>
        </ul>
        <p>
          We may suspend or revoke access if we reasonably believe these Terms
          have been violated.
        </p>
      </Section>

      <Section title="Third-party services">
        <p>
          Some features rely on third-party providers, including PB Vision,
          YouTube, Stripe, and email delivery services. Your use of those
          features may require acceptance of separate third-party terms. We are
          not responsible for third-party platforms, their availability, or
          their processing times.
        </p>
      </Section>

      <Section title="Intellectual property">
        <p>
          The Services, including software, branding, and site content, are
          owned by us or our licensors. Video footage may be recorded at
          participating venues under arrangements with clubs or operators.
          Your purchase or claim grants the access rights described at checkout,
          not ownership of underlying video files or platform intellectual
          property.
        </p>
      </Section>

      <Section title="Disclaimers">
        <p>
          THE SERVICES ARE PROVIDED &quot;AS IS&quot; AND &quot;AS
          AVAILABLE.&quot; TO THE MAXIMUM EXTENT PERMITTED BY LAW, WE DISCLAIM
          ALL WARRANTIES, EXPRESS OR IMPLIED, INCLUDING IMPLIED WARRANTIES OF
          MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE, AND
          NON-INFRINGEMENT.
        </p>
        <p>
          We do not guarantee uninterrupted access, error-free operation, perfect
          video quality, or that optional analysis or review services will meet
          every expectation.
        </p>
      </Section>

      <Section title="Limitation of liability">
        <p>
          TO THE MAXIMUM EXTENT PERMITTED BY LAW, WE AND OUR SUPPLIERS WILL NOT
          BE LIABLE FOR ANY INDIRECT, INCIDENTAL, SPECIAL, CONSEQUENTIAL, OR
          PUNITIVE DAMAGES, OR ANY LOSS OF PROFITS, DATA, OR GOODWILL, ARISING
          FROM YOUR USE OF THE SERVICES.
        </p>
        <p>
          TO THE MAXIMUM EXTENT PERMITTED BY LAW, OUR TOTAL LIABILITY FOR ANY
          CLAIM ARISING OUT OF OR RELATING TO THE SERVICES WILL NOT EXCEED THE
          GREATER OF THE AMOUNT YOU PAID US FOR THE RELEVANT PRODUCT IN THE
          TWELVE MONTHS BEFORE THE EVENT GIVING RISE TO THE CLAIM OR ONE HUNDRED
          U.S. DOLLARS ($100).
        </p>
      </Section>

      <Section title="Indemnification">
        <p>
          You agree to indemnify and hold us harmless from claims, damages,
          losses, and expenses arising out of your misuse of the Services or
          violation of these Terms.
        </p>
      </Section>

      <Section title="Changes">
        <p>
          We may modify these Terms from time to time. If we make material
          changes, we may provide notice by updating the date at the top of this
          page or through the Services. Continued use after changes become
          effective constitutes acceptance of the revised Terms.
        </p>
      </Section>

      <Section title="Governing law">
        <p>
          These Terms are governed by the laws of the State of Wisconsin,
          without regard to conflict-of-law principles, except where prohibited
          by applicable consumer protection law in your jurisdiction.
        </p>
      </Section>

      <Section title="Contact">
        <p>
          Questions about these Terms may be sent to{' '}
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
