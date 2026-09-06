'use client';

// PROTOTYPE — three variants of the sign-in step inside the checkout sheet,
// switchable via ?variant=A|B|C on the existing /e/[eventId] route (plan:
// docs/plans/2026-08-otp-login-checkout.md). UI only: no Supabase, no tRPC —
// "send" fakes a delay and any 6-digit code verifies. Delete this folder (and
// the PROTOTYPE-marked lines in CheckoutSheet.tsx) once a variant wins.

import { useState } from 'react';
import { ArrowLeft } from 'lucide-react';
import { REGEXP_ONLY_DIGITS } from 'input-otp';
import {
  InputOTP,
  InputOTPGroup,
  InputOTPSlot,
} from '@/components/ui/input-otp';
import { Input } from '@/components/ui/input';
import { Spinner } from '@/components/ui/spinner';
import PrototypeSwitcher from './PrototypeSwitcher';

export type AuthPrototypeSummary = {
  items: { name: string; qty: number }[];
  totalCents: number;
};

type VariantProps = {
  eventName: string;
  summary: AuthPrototypeSummary;
  onBack: () => void;
  onDone: (
    email: string,
    names?: { firstName: string; lastName: string }
  ) => void;
};

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

function money(cents: number) {
  return (cents / 100).toLocaleString('en-US', {
    style: 'currency',
    currency: 'USD',
  });
}

function useMockOtp(onDone: (email: string) => void) {
  const [email, setEmail] = useState('');
  const [phase, setPhase] = useState<
    'email' | 'sending' | 'code' | 'verifying'
  >('email');
  const [code, setCode] = useState('');

  const send = async () => {
    if (!/.+@.+\..+/.test(email)) return;
    setPhase('sending');
    await wait(800);
    setPhase('code');
  };
  const verify = async () => {
    setPhase('verifying');
    await wait(600);
    onDone(email.toLowerCase());
  };
  const reset = () => {
    setPhase('email');
    setCode('');
  };
  return { email, setEmail, phase, code, setCode, send, verify, reset };
}

function CodeBoxes({
  value,
  onChange,
  onComplete,
  disabled,
}: {
  value: string;
  onChange: (v: string) => void;
  onComplete: (v: string) => void;
  disabled?: boolean;
}) {
  return (
    <InputOTP
      maxLength={6}
      pattern={REGEXP_ONLY_DIGITS}
      value={value}
      onChange={onChange}
      onComplete={onComplete}
      containerClassName="justify-center"
      autoComplete="one-time-code"
      autoFocus
      disabled={disabled}
    >
      <InputOTPGroup>
        {[0, 1, 2, 3, 4, 5].map((i) => (
          <InputOTPSlot key={i} index={i} />
        ))}
      </InputOTPGroup>
    </InputOTP>
  );
}

function StepHeader({
  title,
  eventName,
  onBack,
}: {
  title: string;
  eventName: string;
  onBack: () => void;
}) {
  return (
    <div className="flex items-center gap-2 border-b border-border px-5 py-4">
      <button
        type="button"
        aria-label="Back"
        onClick={onBack}
        className="grid h-9 w-9 shrink-0 place-items-center rounded-full text-foreground transition-colors hover:bg-muted"
      >
        <ArrowLeft className="h-5 w-5" />
      </button>
      <div className="min-w-0">
        <h2 className="text-lg font-extrabold tracking-tight">{title}</h2>
        <p className="truncate text-sm text-muted-foreground">{eventName}</p>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Variant A — the sign-in gate as its own step between select and    */
/* contact, styled like the other sheet steps.                        */
/* ------------------------------------------------------------------ */
function VariantA({ eventName, onBack, onDone }: VariantProps) {
  const otp = useMockOtp(onDone);

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      <StepHeader title="Sign in" eventName={eventName} onBack={onBack} />
      <div className="flex-1 overflow-y-auto px-5 py-6">
        {otp.phase === 'email' || otp.phase === 'sending' ? (
          <>
            <p className="mb-6 text-sm text-muted-foreground">
              Your tickets live in your account. Enter your email and
              we&rsquo;ll send you a 6-digit code — no password needed.
            </p>
            <div className="space-y-4">
              <div>
                <p className="mb-2 text-sm font-medium">Email</p>
                <Input
                  type="email"
                  placeholder="you@example.com"
                  value={otp.email}
                  onChange={(e) => otp.setEmail(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && otp.send()}
                />
              </div>
              <button
                type="button"
                onClick={otp.send}
                disabled={otp.phase === 'sending'}
                className="flex h-12 w-full items-center justify-center rounded-2xl bg-primary font-bold text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-40"
              >
                {otp.phase === 'sending' ? 'Sending…' : 'Email me a code'}
              </button>
            </div>
          </>
        ) : (
          <div className="text-center">
            <h3 className="mb-2 text-xl font-bold">Check your email</h3>
            <p className="mb-8 text-sm text-muted-foreground">
              We sent a 6-digit code to{' '}
              <span className="font-medium text-foreground">{otp.email}</span>.
            </p>
            <CodeBoxes
              value={otp.code}
              onChange={otp.setCode}
              onComplete={otp.verify}
              disabled={otp.phase === 'verifying'}
            />
            {otp.phase === 'verifying' ? (
              <p className="mt-6 flex items-center justify-center gap-2 text-sm text-muted-foreground">
                <Spinner className="size-4" /> Signing you in…
              </p>
            ) : (
              <p className="mt-6 text-sm text-muted-foreground">
                Didn&rsquo;t get it? Check spam, or{' '}
                <button type="button" className="font-medium text-primary">
                  resend the code
                </button>
                .
              </p>
            )}
            <button
              type="button"
              onClick={otp.reset}
              className="mt-3 text-sm text-muted-foreground hover:underline"
            >
              Use a different email
            </button>
            <p className="mt-8 font-mono text-[10px] text-muted-foreground/60">
              prototype: any 6-digit code works
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Variant B — no separate step: contact details and sign-in are one  */
/* screen. The code strip appears under the email after "continue".   */
/* ------------------------------------------------------------------ */
function VariantB({ eventName, onBack, onDone }: VariantProps) {
  const otp = useMockOtp(onDone);
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');

  const locked = otp.phase === 'code' || otp.phase === 'verifying';

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      <StepHeader title="Your details" eventName={eventName} onBack={onBack} />
      <div className="flex-1 space-y-4 overflow-y-auto px-5 py-4">
        <div className="grid grid-cols-2 gap-3">
          <div>
            <p className="mb-2 text-sm font-medium">First name</p>
            <Input
              placeholder="First name"
              value={firstName}
              onChange={(e) => setFirstName(e.target.value)}
            />
          </div>
          <div>
            <p className="mb-2 text-sm font-medium">Last name</p>
            <Input
              placeholder="Last name"
              value={lastName}
              onChange={(e) => setLastName(e.target.value)}
            />
          </div>
        </div>
        <div>
          <p className="mb-2 text-sm font-medium">Email</p>
          <Input
            type="email"
            placeholder="you@example.com"
            value={otp.email}
            onChange={(e) => otp.setEmail(e.target.value)}
            disabled={locked}
          />
        </div>
        {!locked && (
          <p className="text-xs text-muted-foreground">
            We&rsquo;ll email you a 6-digit code to confirm it&rsquo;s you — no
            password needed.
          </p>
        )}
        {locked && (
          <div className="rounded-2xl border border-primary/30 bg-primary/5 p-4 text-center">
            <p className="mb-3 text-sm">
              We emailed a 6-digit code to{' '}
              <span className="font-semibold">{otp.email}</span>
            </p>
            <CodeBoxes
              value={otp.code}
              onChange={otp.setCode}
              onComplete={otp.verify}
              disabled={otp.phase === 'verifying'}
            />
            <div className="mt-3 flex justify-center gap-4 text-xs text-muted-foreground">
              <button type="button" className="hover:underline">
                Resend code
              </button>
              <button
                type="button"
                onClick={otp.reset}
                className="hover:underline"
              >
                Change email
              </button>
            </div>
            <p className="mt-3 font-mono text-[10px] text-muted-foreground/60">
              prototype: any 6-digit code works
            </p>
          </div>
        )}
      </div>
      <div className="border-t border-border px-5 py-4">
        <button
          type="button"
          onClick={otp.phase === 'email' ? otp.send : undefined}
          disabled={
            otp.phase === 'sending' || otp.phase === 'verifying' || locked
          }
          className="flex h-12 w-full items-center justify-center rounded-2xl bg-primary font-bold text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-40"
        >
          {otp.phase === 'sending'
            ? 'Sending code…'
            : otp.phase === 'verifying'
              ? 'Signing you in…'
              : locked
                ? 'Enter the code above'
                : 'Continue'}
        </button>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Variant C — focused takeover: the selection summary stays visible  */
/* on top for reassurance; sign-in is the hero. No header chrome.     */
/* ------------------------------------------------------------------ */
function VariantC({ eventName, summary, onBack, onDone }: VariantProps) {
  const otp = useMockOtp(onDone);

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      <div className="flex-1 overflow-y-auto px-5 py-6">
        <div className="mb-8 rounded-2xl border border-border bg-muted/50 p-4">
          <p className="mb-2 truncate text-sm font-semibold">{eventName}</p>
          {summary.items.map((item) => (
            <div
              key={item.name}
              className="flex justify-between text-sm text-muted-foreground"
            >
              <span>
                {item.qty} × {item.name}
              </span>
            </div>
          ))}
          <div className="mt-2 flex justify-between border-t border-border pt-2 text-sm font-bold">
            <span>Total</span>
            <span>{money(summary.totalCents)}</span>
          </div>
        </div>

        {otp.phase === 'email' || otp.phase === 'sending' ? (
          <div className="text-center">
            <h3 className="mb-1 text-2xl font-extrabold tracking-tight">
              Lock in your tickets
            </h3>
            <p className="mb-6 text-sm text-muted-foreground">
              Sign in to finish — we&rsquo;ll email you a 6-digit code. No
              password, no forms.
            </p>
            <Input
              type="email"
              placeholder="you@example.com"
              className="h-12 text-center text-base"
              value={otp.email}
              onChange={(e) => otp.setEmail(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && otp.send()}
            />
            <button
              type="button"
              onClick={otp.send}
              disabled={otp.phase === 'sending'}
              className="mt-3 flex h-12 w-full items-center justify-center rounded-2xl bg-primary font-bold text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-40"
            >
              {otp.phase === 'sending' ? 'Sending…' : 'Send my code'}
            </button>
          </div>
        ) : (
          <div className="text-center">
            <h3 className="mb-1 text-2xl font-extrabold tracking-tight">
              Enter your code
            </h3>
            <p className="mb-6 text-sm text-muted-foreground">
              Sent to{' '}
              <span className="font-medium text-foreground">{otp.email}</span> ·{' '}
              <button
                type="button"
                onClick={otp.reset}
                className="text-primary hover:underline"
              >
                change
              </button>
            </p>
            <CodeBoxes
              value={otp.code}
              onChange={otp.setCode}
              onComplete={otp.verify}
              disabled={otp.phase === 'verifying'}
            />
            {otp.phase === 'verifying' ? (
              <p className="mt-6 flex items-center justify-center gap-2 text-sm text-muted-foreground">
                <Spinner className="size-4" /> Signing you in…
              </p>
            ) : (
              <p className="mt-6 text-sm text-muted-foreground">
                <button type="button" className="font-medium text-primary">
                  Resend code
                </button>
              </p>
            )}
            <p className="mt-8 font-mono text-[10px] text-muted-foreground/60">
              prototype: any 6-digit code works
            </p>
          </div>
        )}
      </div>
      <div className="border-t border-border px-5 py-3 text-center">
        <button
          type="button"
          onClick={onBack}
          className="text-sm text-muted-foreground hover:text-foreground hover:underline"
        >
          ‹ Change tickets
        </button>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Variant D — email-first branch (the flow from design review):      */
/* enter email → we check for an account. Existing → welcome back +   */
/* code. New → mini "create your account" (first/last name) → code.   */
/* Mock: an email containing "new" is treated as a first-time buyer;  */
/* existing accounts come back with mock profile names.               */
/* ------------------------------------------------------------------ */
function VariantD({ eventName, onBack, onDone }: VariantProps) {
  const [email, setEmail] = useState('');
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [code, setCode] = useState('');
  const [isNew, setIsNew] = useState(false);
  const [phase, setPhase] = useState<
    'email' | 'looking' | 'signup' | 'sending' | 'code' | 'verifying'
  >('email');

  const lookup = async () => {
    if (!/.+@.+\..+/.test(email)) return;
    setPhase('looking');
    await wait(600);
    const fresh = email.toLowerCase().includes('new');
    setIsNew(fresh);
    setPhase(fresh ? 'signup' : 'code');
  };
  const createAccount = async () => {
    if (!firstName.trim() || !lastName.trim()) return;
    setPhase('sending');
    await wait(700);
    setPhase('code');
  };
  const verify = async () => {
    setPhase('verifying');
    await wait(600);
    onDone(
      email.toLowerCase(),
      isNew
        ? { firstName: firstName.trim(), lastName: lastName.trim() }
        : { firstName: 'Jordan', lastName: 'Reid' } // mock account profile
    );
  };
  const changeEmail = () => {
    setPhase('email');
    setCode('');
  };

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      <StepHeader
        title={phase === 'signup' ? 'Create your account' : 'Sign in'}
        eventName={eventName}
        onBack={onBack}
      />
      <div className="flex-1 overflow-y-auto px-5 py-6">
        {(phase === 'email' || phase === 'looking') && (
          <>
            <p className="mb-6 text-sm text-muted-foreground">
              Sign in to your account to get tickets. Enter your email — if
              you&rsquo;re new, we&rsquo;ll set you up in a few seconds.
            </p>
            <div className="space-y-4">
              <div>
                <p className="mb-2 text-sm font-medium">Email</p>
                <Input
                  type="email"
                  placeholder="you@example.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && lookup()}
                />
              </div>
              <button
                type="button"
                onClick={lookup}
                disabled={phase === 'looking'}
                className="flex h-12 w-full items-center justify-center rounded-2xl bg-primary font-bold text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-40"
              >
                {phase === 'looking' ? 'Checking…' : 'Continue'}
              </button>
              <p className="text-center font-mono text-[10px] text-muted-foreground/60">
                prototype: an email containing &ldquo;new&rdquo; acts as a
                first-time buyer
              </p>
            </div>
          </>
        )}
        {(phase === 'signup' || phase === 'sending') && (
          <>
            <p className="mb-6 text-sm text-muted-foreground">
              Looks like you&rsquo;re new here. Just your name — your tickets
              and receipt go to{' '}
              <span className="font-medium text-foreground">{email}</span>{' '}
              <button
                type="button"
                onClick={changeEmail}
                className="text-primary hover:underline"
              >
                (change)
              </button>
              .
            </p>
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <p className="mb-2 text-sm font-medium">First name</p>
                  <Input
                    placeholder="First name"
                    value={firstName}
                    onChange={(e) => setFirstName(e.target.value)}
                    autoFocus
                  />
                </div>
                <div>
                  <p className="mb-2 text-sm font-medium">Last name</p>
                  <Input
                    placeholder="Last name"
                    value={lastName}
                    onChange={(e) => setLastName(e.target.value)}
                  />
                </div>
              </div>
              <button
                type="button"
                onClick={createAccount}
                disabled={phase === 'sending'}
                className="flex h-12 w-full items-center justify-center rounded-2xl bg-primary font-bold text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-40"
              >
                {phase === 'sending'
                  ? 'Creating your account…'
                  : 'Create account'}
              </button>
            </div>
          </>
        )}
        {(phase === 'code' || phase === 'verifying') && (
          <div className="text-center">
            <h3 className="mb-2 text-xl font-bold">
              {isNew ? 'Confirm your email' : 'Welcome back!'}
            </h3>
            <p className="mb-8 text-sm text-muted-foreground">
              We sent a 6-digit code to{' '}
              <span className="font-medium text-foreground">{email}</span>
              {isNew ? ' to finish setting up your account.' : '.'}
            </p>
            <CodeBoxes
              value={code}
              onChange={setCode}
              onComplete={verify}
              disabled={phase === 'verifying'}
            />
            {phase === 'verifying' ? (
              <p className="mt-6 flex items-center justify-center gap-2 text-sm text-muted-foreground">
                <Spinner className="size-4" /> Signing you in…
              </p>
            ) : (
              <p className="mt-6 text-sm text-muted-foreground">
                Didn&rsquo;t get it? Check spam, or{' '}
                <button type="button" className="font-medium text-primary">
                  resend the code
                </button>
                .
              </p>
            )}
            <button
              type="button"
              onClick={changeEmail}
              className="mt-3 text-sm text-muted-foreground hover:underline"
            >
              Use a different email
            </button>
            <p className="mt-8 font-mono text-[10px] text-muted-foreground/60">
              prototype: any 6-digit code works
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

export const AUTH_PROTOTYPE_VARIANTS = ['D', 'A', 'B', 'C'] as const;

export default function AuthStepPrototype({
  variant,
  onVariantChange,
  ...props
}: VariantProps & {
  variant: string;
  onVariantChange: (variant: string) => void;
}) {
  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      {variant === 'A' ? (
        <VariantA {...props} />
      ) : variant === 'B' ? (
        <VariantB {...props} />
      ) : variant === 'C' ? (
        <VariantC {...props} />
      ) : (
        <VariantD {...props} />
      )}
      <PrototypeSwitcher
        variants={[...AUTH_PROTOTYPE_VARIANTS]}
        current={variant}
        onChange={onVariantChange}
      />
    </div>
  );
}
