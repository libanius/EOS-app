import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Terms of Service — EOS',
  description: 'Terms of Service for EOS, operated by BrightScale Group LLC.',
}

export default function TermsPage() {
  return (
    <>
      <h1>Terms of Service</h1>
      <p className="updated">Last updated: July 17, 2026</p>

      <p>
        These Terms of Service (&ldquo;Terms&rdquo;) govern your access to and use of EOS
        (&ldquo;EOS&rdquo;, the &ldquo;Service&rdquo;), a web application operated by{' '}
        <strong>BrightScale Group LLC</strong> (&ldquo;we&rdquo;, &ldquo;us&rdquo;, or
        &ldquo;our&rdquo;). By creating an account or using the Service, you agree to these Terms.
        If you do not agree, do not use the Service.
      </p>

      <h2>1. The Service</h2>
      <p>
        EOS is an emergency-preparedness and decision-support tool for families. It analyzes the
        information you provide about your household, resources, and situation, and generates
        prepared­ness guidance and action plans, drawing on published references (such as FEMA, the
        American Red Cross, the WHO, and survival literature) and AI reasoning.
      </p>
      <p className="note">
        <strong>EOS is not a substitute for professional emergency services.</strong> In a
        life-threatening emergency, call 911 (or your local emergency number) and follow the
        instructions of official authorities. EOS does not provide medical, legal, or professional
        advice, and its guidance may be incomplete, delayed, or unavailable (including when offline
        or when third-party data sources fail).
      </p>

      <h2>2. Eligibility &amp; Accounts</h2>
      <p>
        You must be at least 18 years old to create an account. You are responsible for the
        accuracy of the information you provide, for maintaining the confidentiality of your login
        credentials, and for all activity under your account.
      </p>

      <h2>3. Subscriptions &amp; Billing</h2>
      <p>EOS offers the following plans, billed in U.S. dollars:</p>
      <ul>
        <li><strong>Free</strong> — $0. Core AI analysis and basic monitoring.</li>
        <li><strong>Family</strong> — $9.90 per month. Adds expanded monitoring, family circles, and emergency QR.</li>
        <li><strong>Premium</strong> — $19.90 per month. Adds advanced monitoring, critical push alerts, history, and exports.</li>
      </ul>
      <p>
        Paid plans are recurring subscriptions that <strong>automatically renew</strong> each month
        until cancelled. Payments are processed by <strong>Stripe, Inc.</strong>; we do not store
        your full card details. By subscribing, you authorize us and Stripe to charge your payment
        method on each renewal date. Prices may change with prior notice; changes apply to the next
        billing cycle.
      </p>

      <h2>4. Cancellation &amp; Refunds</h2>
      <p>
        You may cancel at any time from your account settings. Your paid features remain active
        until the end of the current billing period, after which the account reverts to the Free
        plan. Except where required by law, payments are non-refundable and we do not provide
        prorated refunds for partial billing periods. See our{' '}
        <a href="/refund">Refund &amp; Cancellation Policy</a> for details.
      </p>

      <h2>5. Acceptable Use</h2>
      <p>You agree not to:</p>
      <ul>
        <li>use the Service for any unlawful purpose or in violation of these Terms;</li>
        <li>attempt to gain unauthorized access to the Service, other accounts, or our systems;</li>
        <li>interfere with, disrupt, or place undue load on the Service;</li>
        <li>reverse engineer, resell, or misrepresent the Service.</li>
      </ul>

      <h2>6. Your Content</h2>
      <p>
        You retain ownership of the information you enter (such as household, family, and resource
        data). You grant us a limited license to process that information solely to provide the
        Service. How we handle your data is described in our <a href="/privacy">Privacy Policy</a>.
      </p>

      <h2>7. Intellectual Property</h2>
      <p>
        The Service, including its software, design, and content (excluding your content and
        third-party materials), is owned by BrightScale Group LLC and protected by applicable laws.
      </p>

      <h2>8. Disclaimers</h2>
      <p>
        THE SERVICE IS PROVIDED &ldquo;AS IS&rdquo; AND &ldquo;AS AVAILABLE&rdquo; WITHOUT
        WARRANTIES OF ANY KIND, WHETHER EXPRESS OR IMPLIED, INCLUDING MERCHANTABILITY, FITNESS FOR A
        PARTICULAR PURPOSE, AND NON-INFRINGEMENT. We do not warrant that the Service, its guidance,
        or its data sources will be accurate, complete, uninterrupted, or available at any given
        time.
      </p>

      <h2>9. Limitation of Liability</h2>
      <p>
        TO THE MAXIMUM EXTENT PERMITTED BY LAW, BRIGHTSCALE GROUP LLC WILL NOT BE LIABLE FOR ANY
        INDIRECT, INCIDENTAL, SPECIAL, CONSEQUENTIAL, OR PUNITIVE DAMAGES, OR ANY LOSS ARISING FROM
        YOUR RELIANCE ON THE SERVICE. OUR TOTAL LIABILITY FOR ANY CLAIM WILL NOT EXCEED THE AMOUNT
        YOU PAID US IN THE 12 MONTHS BEFORE THE EVENT GIVING RISE TO THE CLAIM.
      </p>

      <h2>10. Indemnification</h2>
      <p>
        You agree to indemnify and hold harmless BrightScale Group LLC from any claims or expenses
        arising out of your use of the Service or your violation of these Terms.
      </p>

      <h2>11. Changes</h2>
      <p>
        We may modify the Service or these Terms. If we make material changes, we will update the
        &ldquo;Last updated&rdquo; date and, where appropriate, notify you. Your continued use after
        changes take effect constitutes acceptance.
      </p>

      <h2>12. Governing Law</h2>
      <p>
        These Terms are governed by the laws of the State of Florida, USA, without regard to its
        conflict-of-laws rules. Any dispute will be subject to the exclusive jurisdiction of the
        state and federal courts located in Florida.
      </p>

      <h2>13. Contact</h2>
      <p>
        BrightScale Group LLC<br />
        5851 Holmberg Rd, Unit 4124, Parkland, FL 33067, USA<br />
        <a href="mailto:contact@brightscalegroup.com">contact@brightscalegroup.com</a>
      </p>
    </>
  )
}
