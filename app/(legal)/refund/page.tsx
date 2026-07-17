import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Refund & Cancellation Policy — EOS',
  description: 'Refund and cancellation policy for EOS, operated by BrightScale Group LLC.',
}

export default function RefundPage() {
  return (
    <>
      <h1>Refund &amp; Cancellation Policy</h1>
      <p className="updated">Last updated: July 17, 2026</p>

      <p>
        This policy applies to paid subscriptions to EOS, operated by{' '}
        <strong>BrightScale Group LLC</strong>. Payments are processed by Stripe in U.S. dollars.
      </p>

      <h2>1. Subscription Plans</h2>
      <ul>
        <li><strong>Family</strong> — $9.90 per month.</li>
        <li><strong>Premium</strong> — $19.90 per month.</li>
      </ul>
      <p>
        Paid plans are billed monthly in advance and renew automatically until you cancel.
      </p>

      <h2>2. Cancel Anytime</h2>
      <p>
        You can cancel your subscription at any time from your account settings (Billing). When you
        cancel:
      </p>
      <ul>
        <li>your paid features remain active until the end of the current billing period;</li>
        <li>you will not be charged again after the current period ends;</li>
        <li>your account then reverts to the Free plan; your data is not deleted by cancelling.</li>
      </ul>

      <h2>3. Refunds</h2>
      <p>
        Subscriptions are <strong>non-refundable</strong>, and we do not provide{' '}
        <strong>prorated refunds</strong> for the unused portion of a billing period. Because you
        keep access until the end of the period you already paid for, cancelling simply stops future
        renewals.
      </p>
      <p>
        Where a refund is required by applicable law, or in cases of duplicate or clearly erroneous
        charges, we will honor it. If you believe you were charged in error, contact us within 30
        days and we will review it.
      </p>

      <h2>4. Failed Payments</h2>
      <p>
        If a renewal payment fails, we may retry it and may pause paid features until payment
        succeeds. Continued failure will downgrade the account to the Free plan.
      </p>

      <h2>5. How to Cancel or Request Help</h2>
      <p>
        Cancel from <strong>Settings → Billing</strong> in the app, or contact us and we will help:
      </p>
      <p>
        BrightScale Group LLC<br />
        5851 Holmberg Rd, Unit 4124, Parkland, FL 33067, USA<br />
        <a href="mailto:contact@brightscalegroup.com">contact@brightscalegroup.com</a>
      </p>
    </>
  )
}
