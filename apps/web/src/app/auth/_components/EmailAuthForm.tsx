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
import { Turnstile } from '@marsidev/react-turnstile';
import { AUTH_EVENTS } from '@troptix/api/analytics';
import { usePostHog } from 'posthog-js/react';
import { REGEXP_ONLY_DIGITS } from 'input-otp';
import { useRouter } from 'next/navigation';
import { type CSSProperties, useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { z } from 'zod';
import { FormDivider } from './FormDivider';
import { GoogleSignInButton } from './GoogleSignInButton';

const RESEND_COOLDOWN_SECONDS = 45;
const TURNSTILE_SITE_KEY = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY;

const emailSchema = z.object({
  email: z.string().email('Please enter a valid email address'),
});
const codeSchema = z.object({
  code: z.string().regex(/^\d{6}$/, 'Enter the 6-digit code from your email'),
});

type EmailValues = z.infer<typeof emailSchema>;
type CodeValues = z.infer<typeof codeSchema>;

const decoyStyle: CSSProperties = {
  position: 'absolute',
  width: 1,
  height: 1,
  opacity: 0,
  pointerEvents: 'none',
};

export function EmailAuthForm() {
  const router = useRouter();
  const posthog = usePostHog();
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [resendIn, setResendIn] = useState(0);
  const [captchaToken, setCaptchaToken] = useState<string>();
  const [captchaFailed, setCaptchaFailed] = useState(false);
  const [captchaKey, setCaptchaKey] = useState(0);
  // A widget that errors sends no token; Supabase decides whether that is allowed.
  const captchaPending =
    Boolean(TURNSTILE_SITE_KEY) && !captchaToken && !captchaFailed;

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
    const { error } = await signInWithMagicLink(email, captchaToken);
    // Turnstile tokens are single-use: remount the widget for a fresh one.
    setCaptchaToken(undefined);
    setCaptchaKey((k) => k + 1);
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
    // A 5xx is our side failing (e.g. the provisioning trigger, ADR 0036); the
    // code itself may still be good, so keep it for the retry.
    if (error && (error.status ?? 0) >= 500) {
      posthog.capture(AUTH_EVENTS.signInFailed, {
        source: 'code',
        status: error.status,
        error_code: error.code,
      });
      toast.error("We couldn't finish signing you in. Please try again.");
      return;
    }
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

  const captcha = TURNSTILE_SITE_KEY ? (
    <Turnstile
      key={captchaKey}
      siteKey={TURNSTILE_SITE_KEY}
      onSuccess={(token) => {
        setCaptchaToken(token);
        setCaptchaFailed(false);
      }}
      onExpire={() => setCaptchaToken(undefined)}
      onError={() => setCaptchaFailed(true)}
      options={{ appearance: 'interaction-only', theme: 'auto' }}
      className="flex justify-center mt-4"
    />
  ) : null;

  if (sentTo) {
    return (
      <>
        <div className="max-w-md mx-auto text-center">
          <h2 className="text-2xl font-bold text-foreground mb-2">
            Check your email
          </h2>
          <p className="text-muted-foreground mb-8">
            We sent a 6-digit code and a sign-in link to{' '}
            <span className="font-medium text-foreground">{sentTo}</span>. Enter
            the code below, or just tap the link in the email.
          </p>

          <Form {...codeForm}>
            <form onSubmit={submitCode} className="space-y-6" noValidate>
              {/* Autofill decoys: absorb username/password autofill so it doesn't
                dump the email into the OTP boxes; display:none would be skipped. */}
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
                className="w-full h-12 font-medium"
                disabled={codeForm.formState.isSubmitting}
              >
                {codeForm.formState.isSubmitting
                  ? 'Verifying...'
                  : 'Verify code'}
              </Button>
            </form>
          </Form>

          <p className="text-sm text-muted-foreground mt-6">
            Didn&apos;t get it? Check your spam folder
            {resendIn > 0 ? (
              <>, or resend in {resendIn}s.</>
            ) : (
              <>
                , or{' '}
                <button
                  type="button"
                  className="text-primary hover:underline font-medium disabled:opacity-50 disabled:no-underline"
                  disabled={captchaPending}
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
            className="text-sm text-muted-foreground hover:text-foreground hover:underline mt-3"
            onClick={() => {
              setSentTo(null);
              setResendIn(0);
              codeForm.reset();
            }}
          >
            Use a different email
          </button>
        </div>
        {captcha}
      </>
    );
  }

  return (
    <>
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
                  <FormLabel className="font-medium">Email</FormLabel>
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
              className="w-full h-12 font-medium"
              disabled={emailForm.formState.isSubmitting || captchaPending}
            >
              {emailForm.formState.isSubmitting
                ? 'Sending...'
                : 'Email me a sign-in link'}
            </Button>
          </form>
        </Form>
      </div>
      {captcha}
    </>
  );
}
