'use client';

import { Button } from '@/components/ui/button';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import {
  InputOTP,
  InputOTPGroup,
  InputOTPSlot,
} from '@/components/ui/input-otp';
import { Input } from '@/components/ui/input';
import { signInWithMagicLink, verifyEmailOtp } from '@/lib/supabaseAuth';
import { zodResolver } from '@hookform/resolvers/zod';
import { REGEXP_ONLY_DIGITS } from 'input-otp';
import { useRouter } from 'next/navigation';
import { type CSSProperties, useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { z } from 'zod';
import { FormDivider } from './FormDivider';
import { GoogleSignInButton } from './GoogleSignInButton';

const RESEND_COOLDOWN_SECONDS = 45;

const emailSchema = z.object({
  email: z.string().email('Please enter a valid email address'),
});
const codeSchema = z.object({
  code: z.string().regex(/^\d{6}$/, 'Enter the 6-digit code from your email'),
});

type EmailValues = z.infer<typeof emailSchema>;
type CodeValues = z.infer<typeof codeSchema>;

// Visually-hidden style for the autofill-decoy inputs (see below).
const decoyStyle: CSSProperties = {
  position: 'absolute',
  width: 1,
  height: 1,
  opacity: 0,
  pointerEvents: 'none',
};

/**
 * Passwordless sign-in / sign-up — one flow for both. Step 1 collects an email
 * and sends a magic link + code. Step 2 lets the user click the link OR enter
 * the 6-digit code here.
 */
export function EmailAuthForm() {
  const router = useRouter();
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [resendIn, setResendIn] = useState(0);

  const emailForm = useForm<EmailValues>({
    resolver: zodResolver(emailSchema),
    defaultValues: { email: '' },
  });
  const codeForm = useForm<CodeValues>({
    resolver: zodResolver(codeSchema),
    defaultValues: { code: '' },
  });

  // Resend cooldown countdown (also keeps us under Supabase's per-email limit).
  useEffect(() => {
    if (resendIn <= 0) return;
    const t = setTimeout(() => setResendIn((s) => s - 1), 1000);
    return () => clearTimeout(t);
  }, [resendIn]);

  const sendLink = async (email: string) => {
    const { error } = await signInWithMagicLink(email);
    if (error) {
      toast.error('Could not send your email. Please try again in a moment.');
      return false;
    }
    setResendIn(RESEND_COOLDOWN_SECONDS);
    return true;
  };

  const onSendEmail = async ({ email }: EmailValues) => {
    if (await sendLink(email)) setSentTo(email);
  };

  const onVerifyCode = async ({ code }: CodeValues) => {
    if (!sentTo) return;
    const { error } = await verifyEmailOtp(sentTo, code);
    if (error) {
      toast.error('That code is invalid or expired. Try again or resend it.');
      codeForm.reset();
      return;
    }
    toast.success('Signed in!');
    router.push('/');
    router.refresh();
  };
  const submitCode = codeForm.handleSubmit(onVerifyCode);

  // Step 2 — check email + enter code.
  if (sentTo) {
    return (
      <div className="max-w-md mx-auto text-center">
        <h2 className="text-2xl font-bold text-gray-900 mb-2">
          Check your email
        </h2>
        <p className="text-gray-600 mb-8">
          We sent a 6-digit code and a sign-in link to{' '}
          <span className="font-medium text-gray-900">{sentTo}</span>. Enter the
          code below, or just tap the link in the email.
        </p>

        <Form {...codeForm}>
          <form onSubmit={submitCode} className="space-y-6" noValidate>
            {/*
              Decoy fields: password managers / browser autofill target the first
              username + password inputs in a form. These absorb that autofill so
              it doesn't dump the email into the OTP boxes. Rendered (not
              display:none, which autofill skips) but visually hidden + untabbable.
            */}
            <input
              type="text"
              name="username"
              autoComplete="username"
              tabIndex={-1}
              aria-hidden="true"
              style={decoyStyle}
            />
            <input
              type="password"
              name="password"
              autoComplete="current-password"
              tabIndex={-1}
              aria-hidden="true"
              style={decoyStyle}
            />
            <FormField
              control={codeForm.control}
              name="code"
              render={({ field }) => (
                <FormItem className="flex flex-col items-center">
                  <FormControl>
                    <InputOTP
                      maxLength={6}
                      pattern={REGEXP_ONLY_DIGITS}
                      value={field.value}
                      onChange={field.onChange}
                      onComplete={() => submitCode()}
                      containerClassName="justify-center"
                      autoComplete="one-time-code"
                      autoFocus
                      data-1p-ignore="true"
                      data-lpignore="true"
                      data-form-type="other"
                    >
                      <InputOTPGroup>
                        <InputOTPSlot index={0} />
                        <InputOTPSlot index={1} />
                        <InputOTPSlot index={2} />
                        <InputOTPSlot index={3} />
                        <InputOTPSlot index={4} />
                        <InputOTPSlot index={5} />
                      </InputOTPGroup>
                    </InputOTP>
                  </FormControl>
                  <FormMessage className="mt-2" />
                </FormItem>
              )}
            />

            <Button
              type="submit"
              className="w-full h-12 bg-blue-600 hover:bg-blue-700 text-white font-medium"
              disabled={codeForm.formState.isSubmitting}
            >
              {codeForm.formState.isSubmitting ? 'Verifying...' : 'Verify code'}
            </Button>
          </form>
        </Form>

        <p className="text-sm text-gray-600 mt-6">
          Didn&apos;t get it? Check your spam folder
          {resendIn > 0 ? (
            <>, or resend in {resendIn}s.</>
          ) : (
            <>
              , or{' '}
              <button
                type="button"
                className="text-blue-600 hover:underline font-medium"
                onClick={() => sendLink(sentTo)}
              >
                resend the code
              </button>
              .
            </>
          )}
        </p>
        <button
          type="button"
          className="text-sm text-gray-500 hover:text-gray-700 hover:underline mt-3"
          onClick={() => {
            setSentTo(null);
            setResendIn(0);
            codeForm.reset();
          }}
        >
          Use a different email
        </button>
      </div>
    );
  }

  // Step 1 — email + Google.
  return (
    <div className="max-w-md mx-auto">
      <GoogleSignInButton />

      <FormDivider />

      <Form {...emailForm}>
        <form
          onSubmit={emailForm.handleSubmit(onSendEmail)}
          className="space-y-4"
          noValidate
        >
          <FormField
            control={emailForm.control}
            name="email"
            render={({ field }) => (
              <FormItem>
                <FormLabel className="text-gray-800 font-medium">
                  Email
                </FormLabel>
                <FormControl>
                  <Input
                    type="email"
                    autoComplete="email"
                    placeholder="Enter your email address"
                    {...field}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <Button
            type="submit"
            className="w-full h-12 bg-blue-600 hover:bg-blue-700 text-white font-medium"
            disabled={emailForm.formState.isSubmitting}
          >
            {emailForm.formState.isSubmitting
              ? 'Sending...'
              : 'Email me a sign-in link'}
          </Button>
        </form>
      </Form>
    </div>
  );
}
