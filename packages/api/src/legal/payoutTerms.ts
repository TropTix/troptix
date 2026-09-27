import type { PayoutTerms } from '../contracts/payouts';
import { PayoutConfig } from '../services/_shared/payouts';

/**
 * The text is counsel's; the product only records assent to a version. Bump
 * `version` when the words change in substance: every organizer then has to
 * accept again before their next payout request. The holdback numbers come
 * from PayoutConfig so they cannot drift from the ledger; changing them there
 * changes these words and needs the same bump.
 */
export const PAYOUT_TERMS: PayoutTerms = {
  version: '2026-09-27',
  effective: '2026-09-27',
  sections: [
    {
      heading: 'What you appoint TropTix to do',
      body: 'You appoint TropTix as your agent to collect payments from ticket buyers on your behalf. A buyer’s payment to TropTix counts as payment to you. TropTix holds the money for you until it is paid out under these terms.',
    },
    {
      heading: 'When money becomes available',
      body: 'Earnings from an event become available once the event ends, unless TropTix has agreed a different schedule with you. Your payouts page shows the rule that applies to you.',
    },
    {
      heading: 'Holdback',
      body: `TropTix holds back a share of each event’s earnings for a period after the event ends to cover refunds and chargebacks. The default is ${PayoutConfig.HOLDBACK_PERCENT}% for ${PayoutConfig.HOLDBACK_DAYS} days. Whatever remains is then released to your available balance.`,
    },
    {
      heading: 'Requesting a payout',
      body: 'You can have one open request at a time and cancel it any time before it is paid. TropTix sends payouts to the destination you connected: your Stripe account, or the bank account agreed with TropTix.',
    },
    {
      heading: 'Fees',
      body: 'TropTix’s ticketing fee is taken from each sale as shown at checkout, unless your ticket type absorbs it. The cost of sending a payout is TropTix’s.',
    },
    {
      heading: 'Refunds and chargebacks',
      body: 'Refunds you issue and chargebacks from buyers are deducted from your balance. If your balance cannot cover them, they are deducted from future earnings, and TropTix may reverse a payout already sent for that event.',
    },
    {
      heading: 'Bank details',
      body: 'On the Stripe rail your bank details are held by Stripe, and you can update them from your Stripe dashboard. TropTix never stores your account number.',
    },
    {
      heading: 'Changes to these terms',
      body: 'TropTix may update these terms. You will be asked to accept the new version before your next payout request. Open and paid requests are not affected.',
    },
  ],
};
