import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Privacy Policy — EOS',
  description: 'Privacy Policy for EOS, operated by BrightScale Group LLC.',
}

export default function PrivacyPage() {
  return (
    <>
      <h1>Privacy Policy</h1>
      <p className="updated">Last updated: July 17, 2026</p>

      <p>
        This Privacy Policy explains how <strong>BrightScale Group LLC</strong>
        (&ldquo;we&rdquo;, &ldquo;us&rdquo;) collects, uses, and protects personal information when
        you use EOS (the &ldquo;Service&rdquo;). Because EOS helps families prepare for emergencies,
        some of the information you provide may be sensitive. We treat it accordingly.
      </p>

      <h2>1. Information We Collect</h2>
      <ul>
        <li><strong>Account information</strong> — name and email address used to register.</li>
        <li>
          <strong>Profile &amp; household data you provide</strong> — family members, resources and
          supplies, emergency contacts, and optional health-related notes (such as blood type,
          allergies, or medications) you choose to enter.
        </li>
        <li>
          <strong>Location</strong> — an approximate location you set (or geocode) so we can provide
          local weather, hazard, and monitoring information.
        </li>
        <li><strong>Usage data</strong> — basic technical and interaction data, and error diagnostics.</li>
        <li>
          <strong>Payment data</strong> — handled by Stripe. We receive limited billing status and
          identifiers; we do <strong>not</strong> store your full card number.
        </li>
      </ul>

      <h2>2. How We Use Information</h2>
      <ul>
        <li>To provide the Service — generate preparedness guidance and monitoring for you;</li>
        <li>To operate accounts, process subscriptions, and provide support;</li>
        <li>To maintain security, prevent abuse, and diagnose errors;</li>
        <li>To comply with legal obligations.</li>
      </ul>
      <p>
        We do <strong>not sell</strong> your personal information, and we do not use your household
        or health-related data for advertising.
      </p>

      <h2>3. How Information Is Shared</h2>
      <p>
        We share information only with service providers that help us run EOS, under agreements that
        limit their use of it:
      </p>
      <ul>
        <li><strong>Supabase</strong> — database, authentication, and storage;</li>
        <li><strong>Stripe</strong> — payment processing;</li>
        <li><strong>Anthropic</strong> and <strong>OpenAI</strong> — AI processing of the analysis you request;</li>
        <li><strong>Vercel</strong> — application hosting;</li>
        <li>public hazard data sources (e.g., NWS, USGS) which receive only the location needed to return alerts.</li>
      </ul>
      <p>We may also disclose information if required by law or to protect rights and safety.</p>

      <h2>4. Data Retention</h2>
      <p>
        We keep your information while your account is active and as needed to provide the Service.
        You may delete your data by deleting your account or by contacting us; we will remove it
        except where retention is required by law.
      </p>

      <h2>5. Security</h2>
      <p>
        We use industry-standard measures, including encryption in transit and row-level access
        controls, to protect your information. No method of transmission or storage is 100% secure,
        and we cannot guarantee absolute security.
      </p>

      <h2>6. Your Privacy Rights</h2>
      <p>
        Depending on where you live (including under the California Consumer Privacy Act, as amended
        by the CPRA), you may have the right to:
      </p>
      <ul>
        <li>know what personal information we hold about you and request access to it;</li>
        <li>request correction or deletion of your personal information;</li>
        <li>opt out of the &ldquo;sale&rdquo; or &ldquo;sharing&rdquo; of personal information — note that we do not sell or share it;</li>
        <li>not be discriminated against for exercising these rights.</li>
      </ul>
      <p>
        To exercise any right, contact{' '}
        <a href="mailto:contact@brightscalegroup.com">contact@brightscalegroup.com</a>. We will
        respond as required by applicable law.
      </p>

      <h2>7. Children</h2>
      <p>
        EOS is not directed to children under 13, and we do not knowingly collect personal
        information from them. Household profiles for minors are entered and controlled by the adult
        account holder.
      </p>

      <h2>8. International Users</h2>
      <p>
        EOS is operated from the United States. If you access it from elsewhere, you understand that
        your information will be processed in the United States.
      </p>

      <h2>9. Cookies</h2>
      <p>
        We use essential cookies and similar technologies for authentication and preferences (such
        as your language choice). We do not use them for third-party advertising.
      </p>

      <h2>10. Changes</h2>
      <p>
        We may update this Policy. Material changes will be reflected by the &ldquo;Last
        updated&rdquo; date above and, where appropriate, additional notice.
      </p>

      <h2>11. Contact</h2>
      <p>
        BrightScale Group LLC<br />
        5851 Holmberg Rd, Unit 4124, Parkland, FL 33067, USA<br />
        <a href="mailto:contact@brightscalegroup.com">contact@brightscalegroup.com</a>
      </p>
    </>
  )
}
