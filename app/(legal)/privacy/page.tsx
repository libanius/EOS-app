import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Privacy Policy — EOS',
  description: 'Privacy Policy for EOS, operated by BrightScale Group LLC.',
}

export default function PrivacyPage() {
  return (
    <>
      <h1>Privacy Policy</h1>
      <p className="updated">Last updated: November 1, 2026</p>

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

      <h2>3. AI Processing and Your Health Data</h2>
      <p>
        The EOS Pilot, readiness analyses and checklist generation use <strong>OpenAI</strong>, a
        third-party AI service, to write answers. To do that, EOS sends OpenAI the question you ask
        and the context needed to answer it — for example your household size, supplies, approximate
        location, local weather and alerts, and your plan.
      </p>
      <p>
        <strong>Health data is sent only with your explicit permission.</strong> Blood type,
        allergies, medications, medical conditions, medical notes and reduced-mobility status are
        sent to OpenAI only if you turn on <em>&ldquo;AI and health data&rdquo;</em> in the More
        screen. It is off by default, and you can turn it off at any time. The permission covers your
        own record and the records of dependants you entered. Another person&rsquo;s health data is
        never sent on your behalf: if someone shares their record with you through a circle or
        household, it reaches the AI only if <em>that person</em> has given permission.
      </p>
      <p>
        When permission is off, the AI is told only that some health information is not available to
        it, so it does not assume there are no needs. Your emergency card and what you share with
        your circle are not affected by this setting. Under OpenAI&rsquo;s API terms, data sent
        through its API is not used to train its models by default and may be retained for a limited
        period for abuse monitoring.
      </p>

      <h2>4. How Information Is Shared</h2>
      <p>
        We share information only with service providers that help us run EOS, under agreements that
        limit their use of it:
      </p>
      <ul>
        <li><strong>Supabase</strong> — database, authentication, and storage;</li>
        <li><strong>Stripe</strong> — payment processing;</li>
        <li><strong>OpenAI</strong> — AI processing of the answers and analyses you request, as described in Section 3;</li>
        <li><strong>Vercel</strong> — application hosting;</li>
        <li><strong>Apple</strong> and <strong>Google</strong> — delivery of push notifications to your device (a device token and the notification text);</li>
        <li>map and geocoding providers (such as OpenStreetMap, CARTO, MapTiler and Esri) — receive the map area being viewed or the address you search, plus standard request data such as IP address;</li>
        <li>public hazard data sources (e.g., NWS, NHC, USGS, Open-Meteo) which receive only the location needed to return weather and alerts.</li>
      </ul>
      <p>
        <strong>People you choose.</strong> Information you share with a circle or household is
        visible to its members according to the sharing options you select. Your emergency card is
        designed to be read by first responders: anyone with its link or QR code can open it without
        signing in.
      </p>
      <p>We may also disclose information if required by law or to protect rights and safety.</p>

      <h2>5. Data Retention</h2>
      <p>
        We keep your information while your account is active and as needed to provide the Service.
        You may delete your data by deleting your account or by contacting us; we will remove it
        except where retention is required by law.
      </p>

      <h2>6. Security</h2>
      <p>
        We use industry-standard measures, including encryption in transit and row-level access
        controls, to protect your information. No method of transmission or storage is 100% secure,
        and we cannot guarantee absolute security.
      </p>

      <h2>7. Your Privacy Rights</h2>
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

      <h2>8. Children</h2>
      <p>
        EOS is not directed to children under 13, and we do not knowingly collect personal
        information from them. Household profiles for minors are entered and controlled by the adult
        account holder.
      </p>

      <h2>9. International Users</h2>
      <p>
        EOS is operated from the United States. If you access it from elsewhere, you understand that
        your information will be processed in the United States.
      </p>

      <h2>10. Cookies</h2>
      <p>
        We use essential cookies and similar technologies for authentication and preferences (such
        as your language choice). We do not use them for third-party advertising.
      </p>

      <h2>11. Changes</h2>
      <p>
        We may update this Policy. Material changes will be reflected by the &ldquo;Last
        updated&rdquo; date above and, where appropriate, additional notice.
      </p>

      <h2>12. Contact</h2>
      <p>
        BrightScale Group LLC<br />
        5851 Holmberg Rd, Unit 4124, Parkland, FL 33067, USA<br />
        <a href="mailto:contact@brightscalegroup.com">contact@brightscalegroup.com</a>
      </p>
    </>
  )
}
