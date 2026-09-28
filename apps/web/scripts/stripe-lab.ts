/**
 * Stripe payouts lab. Tries account shapes against the sandbox and prints
 * what Stripe accepts, and walks the Global Payouts money movement end to
 * end, so the plans can be checked against Stripe rather than docs.
 *
 *   pnpm --filter web exec tsx --env-file=.env scripts/stripe-lab.ts <command>
 *
 *   variants                         the shapes on offer, with expectations
 *   create <variant> [displayName]   create one account with that shape
 *   inspect <acct_…>                 capabilities and open requirements
 *   link <acct_…>                    mint a hosted-onboarding link
 *   list                             accounts this lab created
 *   cleanup                          close or delete every lab account
 *   fa                               the platform's financial accounts and balances
 *   fund <cents>                     move cents from the payments balance into the financial account
 *   payout-methods <acct_…>          a recipient's payout methods
 *   pay <acct_…> <cents>             an outbound payment in USD to a recipient
 *
 * Refuses to run against anything but a sandbox key. Every account it creates
 * carries `metadata.lab = connect-lab` so `list` and `cleanup` find them.
 */
import Stripe from 'stripe';
import StripePreview from 'stripe-preview';

const LAB = 'connect-lab';
const BASE_URL = process.env.LAB_BASE_URL ?? 'https://example.test';

function fail(message: string): never {
  console.error(message);
  process.exit(1);
}

const key = process.env.STRIPE_SECRET_KEY;
if (!key)
  fail('STRIPE_SECRET_KEY is missing. Run from apps/web with --env-file=.env.');
if (!key.startsWith('sk_test_'))
  fail('Refusing to run: STRIPE_SECRET_KEY is not a sandbox key.');

const stripe = new Stripe(key, { apiVersion: '2026-06-24.dahlia' });
// Global Payouts recipient capabilities (bank_accounts.*) and money movement
// exist only on the preview API version, which the preview SDK is pinned to.
const previewStripe = new StripePreview(key, {
  apiVersion: '2026-08-26.preview',
});

type V2Params = Stripe.V2.Core.AccountCreateParams;
type PreviewParams = StripePreview.V2.Core.AccountCreateParams;
type V1Params = Stripe.AccountCreateParams;

interface Variant {
  expect: string;
  v2?: (name: string) => V2Params;
  preview?: (name: string) => PreviewParams;
  v1?: (name: string) => V1Params;
}

const responsibilities = {
  fees_collector: 'application',
  losses_collector: 'application',
} as const;
const transfers = {
  stripe_balance: { stripe_transfers: { requested: true } },
} as const;
const cardPayments = { card_payments: { requested: true } } as const;

const VARIANTS: Record<string, Variant> = {
  'recipient-only': {
    expect:
      'Rejected with capability_not_available_without_other_capability until Stripe approves the platform for transfers-only accounts.',
    v2: (name) => ({
      display_name: name,
      contact_email: 'lab@example.test',
      dashboard: 'express',
      identity: { country: 'us' },
      defaults: { responsibilities },
      configuration: { recipient: { capabilities: transfers } },
      metadata: { lab: LAB, variant: 'recipient-only' },
    }),
  },
  'recipient-merchant': {
    expect:
      'Accepted. What Connect PR 1 creates today: transfers plus card_payments, Express dashboard.',
    v2: (name) => ({
      display_name: name,
      contact_email: 'lab@example.test',
      dashboard: 'express',
      identity: { country: 'us' },
      defaults: { responsibilities },
      configuration: {
        recipient: { capabilities: transfers },
        merchant: { capabilities: cardPayments },
      },
      metadata: { lab: LAB, variant: 'recipient-merchant' },
    }),
  },
  'recipient-merchant-prefilled': {
    expect:
      'Accepted, with fewer open requirements: entity type and business URL prefilled.',
    v2: (name) => ({
      display_name: name,
      contact_email: 'lab@example.test',
      dashboard: 'express',
      identity: { country: 'us', entity_type: 'individual' },
      defaults: {
        responsibilities,
        profile: { business_url: `${BASE_URL}/o/lab` },
      },
      configuration: {
        recipient: { capabilities: transfers },
        merchant: { capabilities: cardPayments },
      },
      metadata: { lab: LAB, variant: 'recipient-merchant-prefilled' },
    }),
  },
  'no-dashboard': {
    expect:
      'Tells us whether dashboard: none with the same capabilities is allowed when the platform owns losses.',
    v2: (name) => ({
      display_name: name,
      contact_email: 'lab@example.test',
      dashboard: 'none',
      identity: { country: 'us' },
      defaults: { responsibilities },
      configuration: {
        recipient: { capabilities: transfers },
        merchant: { capabilities: cardPayments },
      },
      metadata: { lab: LAB, variant: 'no-dashboard' },
    }),
  },
  'jamaica-local-bank': {
    expect:
      'Rejected on the pinned API version: bank_accounts is a preview-only capability. See jamaica-global-payouts.',
    v2: (name) =>
      ({
        display_name: name,
        contact_email: 'lab@example.test',
        identity: { country: 'jm' },
        configuration: {
          recipient: {
            capabilities: { bank_accounts: { local: { requested: true } } },
          },
        },
        metadata: { lab: LAB, variant: 'jamaica-local-bank' },
      }) as unknown as V2Params,
  },
  'jamaica-global-payouts': {
    expect:
      'Accepted on the preview API version: a Global Payouts recipient in Jamaica with a local bank payout method. What the Global Payouts rail creates (ADR 0034). Not a Connect account; paid by outbound payment from the platform financial account.',
    preview: (name) => ({
      display_name: name,
      contact_email: 'lab@example.test',
      identity: { country: 'jm', entity_type: 'individual' },
      configuration: {
        recipient: {
          capabilities: { bank_accounts: { local: { requested: true } } },
        },
      },
      metadata: { lab: LAB, variant: 'jamaica-global-payouts' },
    }),
  },
  'v1-express-transfers-only': {
    expect:
      'Rejected: "Your platform needs approval for accounts to have requested the `transfers` capability without the `card_payments` capability."',
    v1: (name) => ({
      controller: {
        fees: { payer: 'application' },
        losses: { payments: 'application' },
        stripe_dashboard: { type: 'express' },
      },
      country: 'US',
      business_profile: { name },
      capabilities: { transfers: { requested: true } },
      metadata: { lab: LAB, variant: 'v1-express-transfers-only' },
    }),
  },
  'v1-express-both': {
    expect: 'Accepted. The v1 equivalent of recipient-merchant.',
    v1: (name) => ({
      controller: {
        fees: { payer: 'application' },
        losses: { payments: 'application' },
        stripe_dashboard: { type: 'express' },
      },
      country: 'US',
      business_profile: { name },
      capabilities: {
        card_payments: { requested: true },
        transfers: { requested: true },
      },
      metadata: { lab: LAB, variant: 'v1-express-both' },
    }),
  },
};

const INCLUDE = [
  'configuration.recipient',
  'configuration.merchant',
  'requirements',
  'identity',
] as const;

function describeV2(account: StripePreview.V2.Core.Account): void {
  const recipient = account.configuration?.recipient?.capabilities;
  const merchant = account.configuration?.merchant?.capabilities;
  const entries = account.requirements?.entries ?? [];
  console.log(`  id                 ${account.id}`);
  console.log(
    `  applied            ${JSON.stringify(account.applied_configurations)}`
  );
  console.log(`  country            ${account.identity?.country ?? '-'}`);
  console.log(`  dashboard          ${account.dashboard}`);
  console.log(
    `  stripe_transfers   ${recipient?.stripe_balance?.stripe_transfers?.status ?? '-'}`
  );
  console.log(
    `  bank_accounts.local ${recipient?.bank_accounts?.local?.status ?? '-'}`
  );
  console.log(`  card_payments      ${merchant?.card_payments?.status ?? '-'}`);
  console.log(
    `  requirements       ${entries.length} open, deadline ${account.requirements?.summary?.minimum_deadline?.status ?? '-'}`
  );
  for (const entry of entries.slice(0, 20)) {
    console.log(`    - ${entry.description}`);
  }
  if (entries.length > 20) console.log(`    … ${entries.length - 20} more`);
}

function describeV1(account: Stripe.Account): void {
  console.log(`  id                 ${account.id}`);
  console.log(`  type               ${account.type}`);
  console.log(`  transfers          ${account.capabilities?.transfers ?? '-'}`);
  console.log(
    `  card_payments      ${account.capabilities?.card_payments ?? '-'}`
  );
  console.log(
    `  currently_due      ${JSON.stringify(account.requirements?.currently_due ?? [])}`
  );
}

function stripeErrorLine(err: unknown): string {
  const e = err as { code?: string; statusCode?: number; message?: string };
  return `${e.statusCode ?? '?'} ${e.code ?? 'no code'}: ${e.message}`;
}

async function create(
  variantName: string,
  displayName?: string
): Promise<void> {
  const variant = VARIANTS[variantName];
  if (!variant) fail(`Unknown variant "${variantName}". Run: variants`);
  const name =
    displayName ??
    `LAB ${variantName} ${new Date().toISOString().slice(0, 16)}`;
  console.log(`\n${variantName}\n  expect: ${variant.expect}\n`);
  try {
    if (variant.preview) {
      const account = await previewStripe.v2.core.accounts.create({
        ...variant.preview(name),
        include: [...INCLUDE],
      });
      console.log('  ACCEPTED');
      describeV2(account);
    } else if (variant.v2) {
      const account = await stripe.v2.core.accounts.create({
        ...variant.v2(name),
        include: [...INCLUDE],
      });
      console.log('  ACCEPTED');
      describeV2(account as unknown as StripePreview.V2.Core.Account);
    } else if (variant.v1) {
      const account = await stripe.accounts.create(variant.v1(name));
      console.log('  ACCEPTED');
      describeV1(account);
    }
  } catch (err) {
    console.log(`  REJECTED ${stripeErrorLine(err)}`);
  }
}

/** The preview version shows both capabilities, so every v2 read goes through it. */
async function retrieve(id: string): Promise<StripePreview.V2.Core.Account> {
  return previewStripe.v2.core.accounts.retrieve(id, {
    include: [...INCLUDE],
  });
}

async function inspect(id: string): Promise<void> {
  try {
    describeV2(await retrieve(id));
  } catch (err) {
    console.log(`  v2 retrieve failed (${stripeErrorLine(err)}); trying v1`);
    describeV1(await stripe.accounts.retrieve(id));
  }
}

async function link(id: string): Promise<void> {
  const account = await retrieve(id);
  const merchant = (account.applied_configurations ?? []).includes('merchant');
  const params = {
    account: id,
    use_case: {
      type: 'account_onboarding' as const,
      account_onboarding: {
        configurations: merchant
          ? (['recipient', 'merchant'] as const)
          : (['recipient'] as const),
        refresh_url: `${BASE_URL}/organizer/payouts/stripe/refresh`,
        return_url: `${BASE_URL}/organizer/payouts/stripe/return`,
        collection_options: { fields: 'eventually_due' as const },
      },
    },
  };
  const accountLink = merchant
    ? await stripe.v2.core.accountLinks.create({
        ...params,
        use_case: {
          ...params.use_case,
          account_onboarding: {
            ...params.use_case.account_onboarding,
            configurations: ['recipient', 'merchant'],
          },
        },
      })
    : await previewStripe.v2.core.accountLinks.create({
        ...params,
        use_case: {
          ...params.use_case,
          account_onboarding: {
            ...params.use_case.account_onboarding,
            configurations: ['recipient'],
          },
        },
      });
  console.log(`  client         ${merchant ? 'connect (GA)' : 'preview'}`);
  console.log(`  expires        ${accountLink.expires_at}`);
  console.log(`  url            ${accountLink.url}`);
}

async function labAccounts(): Promise<
  Array<{ id: string; kind: 'v1' | 'v2'; name: string; variant: string }>
> {
  const found = new Map<
    string,
    { id: string; kind: 'v1' | 'v2'; name: string; variant: string }
  >();
  for await (const account of previewStripe.v2.core.accounts.list({
    limit: 20,
  })) {
    if (account.metadata?.lab === LAB) {
      found.set(account.id, {
        id: account.id,
        kind: 'v2',
        name: account.display_name ?? '',
        variant: account.metadata?.variant ?? '',
      });
    }
  }
  for await (const account of stripe.accounts.list({ limit: 100 })) {
    if (account.metadata?.lab === LAB && !found.has(account.id)) {
      found.set(account.id, {
        id: account.id,
        kind: 'v1',
        name: account.business_profile?.name ?? '',
        variant: account.metadata?.variant ?? '',
      });
    }
  }
  return Array.from(found.values());
}

async function list(): Promise<void> {
  const accounts = await labAccounts();
  if (accounts.length === 0) {
    console.log('No lab accounts.');
    return;
  }
  for (const account of accounts) {
    console.log(
      `${account.id}  ${account.kind}  ${account.variant.padEnd(28)}  ${account.name}`
    );
  }
}

async function cleanup(): Promise<void> {
  const accounts = await labAccounts();
  for (const account of accounts) {
    try {
      if (account.kind === 'v1') {
        await stripe.accounts.del(account.id);
        console.log(`deleted ${account.id}`);
      } else {
        await previewStripe.v2.core.accounts.close(account.id);
        console.log(`closed  ${account.id}`);
      }
    } catch (err) {
      console.log(`could not remove ${account.id}: ${stripeErrorLine(err)}`);
    }
  }
  if (accounts.length === 0) console.log('Nothing to clean up.');
}

async function financialAccount(): Promise<StripePreview.V2.MoneyManagement.FinancialAccount> {
  const wanted = process.env.STRIPE_FINANCIAL_ACCOUNT_ID;
  for await (const account of previewStripe.v2.moneyManagement.financialAccounts.list(
    { limit: 10 }
  )) {
    if (!wanted || account.id === wanted) return account;
  }
  fail(
    wanted
      ? `Financial account ${wanted} not found in this sandbox.`
      : 'This sandbox has no financial account. Activate Treasury first.'
  );
}

function amountLine(
  amounts: Record<string, { value: number; currency: string }>
) {
  return (
    Object.values(amounts)
      .map((amount) => `${amount.value} ${amount.currency}`)
      .join(', ') || '-'
  );
}

async function fa(): Promise<void> {
  for await (const account of previewStripe.v2.moneyManagement.financialAccounts.list(
    { limit: 10 }
  )) {
    console.log(`${account.id}  ${account.status}  ${account.type}`);
    console.log(`  available         ${amountLine(account.balance.available)}`);
    console.log(
      `  inbound_pending   ${amountLine(account.balance.inbound_pending)}`
    );
    console.log(
      `  outbound_pending  ${amountLine(account.balance.outbound_pending)}`
    );
  }
}

async function fund(cents: number): Promise<void> {
  const account = await financialAccount();
  const payout = await stripe.payouts.create({
    amount: cents,
    currency: 'usd',
    payout_method: account.id,
    description: 'lab: fund the financial account',
  });
  console.log(`  payout   ${payout.id}  ${payout.status}`);
  console.log(`  to       ${account.id}`);
}

async function payoutMethods(accountId: string): Promise<void> {
  let count = 0;
  for await (const method of previewStripe.v2.moneyManagement.payoutMethods.list(
    { limit: 10 },
    { stripeContext: accountId }
  )) {
    count += 1;
    console.log(`${method.id}  ${method.type}`);
    console.log(
      `  payments ${method.usage_status.payments}  restricted ${method.restricted}`
    );
    if (method.bank_account) {
      console.log(
        `  bank     ${method.bank_account.bank_name ?? '-'} ····${method.bank_account.last4}  ${method.bank_account.country}  archived ${method.bank_account.archived}`
      );
    }
  }
  if (count === 0) console.log('No payout methods on this recipient.');
}

async function pay(accountId: string, cents: number): Promise<void> {
  const account = await financialAccount();
  let method: StripePreview.V2.MoneyManagement.PayoutMethod | undefined;
  for await (const candidate of previewStripe.v2.moneyManagement.payoutMethods.list(
    { limit: 10 },
    { stripeContext: accountId }
  )) {
    if (
      candidate.type === 'bank_account' &&
      !candidate.restricted &&
      !candidate.bank_account?.archived &&
      candidate.usage_status.payments === 'eligible'
    ) {
      method = candidate;
      break;
    }
  }
  if (!method) fail('No eligible bank account on this recipient.');
  const payment =
    await previewStripe.v2.moneyManagement.outboundPayments.create(
      {
        from: { financial_account: account.id, currency: 'usd' },
        to: { recipient: accountId, payout_method: method.id },
        amount: { value: cents, currency: 'usd' },
        description: 'lab: outbound payment',
        metadata: { lab: LAB },
      },
      { idempotencyKey: `lab-pay-${accountId}-${Date.now()}` }
    );
  console.log(`  payment   ${payment.id}  ${payment.status}`);
  console.log(
    `  debited   ${payment.from.debited.value} ${payment.from.debited.currency}`
  );
  console.log(
    `  credited  ${payment.to.credited.value} ${payment.to.credited.currency}`
  );
  console.log(`  arrives   ${payment.expected_arrival_date ?? '-'}`);
  console.log(`  receipt   ${payment.receipt_url ?? '-'}`);
}

function cents(raw: string | undefined, usage: string): number {
  const value = Number(raw);
  if (!Number.isInteger(value) || value <= 0) fail(usage);
  return value;
}

async function main(): Promise<void> {
  const [command, arg1, arg2] = process.argv.slice(2);
  switch (command) {
    case 'variants':
      for (const [name, variant] of Object.entries(VARIANTS)) {
        console.log(`${name.padEnd(30)} ${variant.expect}`);
      }
      return;
    case 'create':
      if (!arg1) fail('Usage: create <variant> [displayName]');
      return create(arg1, arg2);
    case 'inspect':
      if (!arg1) fail('Usage: inspect <acct_…>');
      return inspect(arg1);
    case 'link':
      if (!arg1) fail('Usage: link <acct_…>');
      return link(arg1);
    case 'list':
      return list();
    case 'cleanup':
      return cleanup();
    case 'fa':
      return fa();
    case 'fund':
      return fund(cents(arg1, 'Usage: fund <cents>'));
    case 'payout-methods':
      if (!arg1) fail('Usage: payout-methods <acct_…>');
      return payoutMethods(arg1);
    case 'pay':
      if (!arg1) fail('Usage: pay <acct_…> <cents>');
      return pay(arg1, cents(arg2, 'Usage: pay <acct_…> <cents>'));
    default:
      fail(
        'Commands: variants | create <variant> | inspect <id> | link <id> | list | cleanup | fa | fund <cents> | payout-methods <id> | pay <id> <cents>'
      );
  }
}

main().catch((err) => fail(stripeErrorLine(err)));
