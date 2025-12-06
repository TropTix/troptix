'use client';

import { useEffect, useState, Suspense, use } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { StripeError, loadStripe } from '@stripe/stripe-js';
import { toast } from 'sonner';
import {
  AlertTriangle,
  Home,
  FileText,
  XCircle,
  PartyPopper,
  Info,
  TicketIcon,
  Mail, // Added for contact support
  RotateCw, // Added for refresh hint
  CreditCard, // Icon for payment processing
} from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/ui/spinner'; // Assuming this is your spinner component
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';

const stripeKey = process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY || '';
if (!stripeKey) {
  console.warn(
    'Stripe publishable key is not set. Payment functionality will be affected.'
  );
}
const stripePromise = stripeKey ? loadStripe(stripeKey) : Promise.resolve(null);

interface StatusDisplayProps {
  icon: React.ReactNode;
  title: string;
  message: React.ReactNode;
  orderId?: string | null;
  actions?: React.ReactNode;
  theme?: 'success' | 'error' | 'processing' | 'info' | 'free';
  children?: React.ReactNode;
}

const StatusDisplay: React.FC<StatusDisplayProps> = ({
  icon,
  title,
  message,
  orderId,
  actions,
  theme = 'info',
  children,
}) => {
  let pageBgColor = 'bg-slate-50 dark:bg-slate-900';
  let cardBgColor = 'bg-white dark:bg-slate-800';
  let titleColor = 'text-slate-800 dark:text-slate-100';
  let iconContainerBgColor = 'bg-slate-500 dark:bg-slate-400';
  let accentBorderColor = 'border-slate-300 dark:border-slate-700';

  switch (theme) {
    case 'success':
      pageBgColor = 'bg-green-50 dark:bg-green-900/10';
      iconContainerBgColor = 'bg-green-500 dark:bg-green-400';
      titleColor = 'text-green-700 dark:text-green-300';
      accentBorderColor = 'border-green-500 dark:border-green-600';
      break;
    case 'error':
      pageBgColor = 'bg-red-50 dark:bg-red-900/10';
      iconContainerBgColor = 'bg-red-500 dark:bg-red-400';
      titleColor = 'text-red-700 dark:text-red-300';
      accentBorderColor = 'border-red-500 dark:border-red-600';
      break;
    case 'processing':
      pageBgColor = 'bg-blue-50 dark:bg-blue-900/10';
      iconContainerBgColor = 'bg-blue-500 dark:bg-blue-400';
      titleColor = 'text-blue-700 dark:text-blue-300';
      accentBorderColor = 'border-blue-500 dark:border-blue-600';
      break;
    case 'free':
      pageBgColor = 'bg-sky-50 dark:bg-sky-900/10';
      iconContainerBgColor = 'bg-sky-500 dark:bg-sky-400';
      titleColor = 'text-sky-700 dark:text-sky-300';
      accentBorderColor = 'border-sky-500 dark:border-sky-600';
      break;
  }

  return (
    <div
      className={`flex flex-col items-center justify-center min-h-screen p-4 sm:p-6 md:p-8 ${pageBgColor} transition-colors duration-300`}
    >
      <div
        className={`w-full max-w-lg rounded-lg shadow-xl overflow-hidden ${cardBgColor} border-t-4 ${accentBorderColor}`}
      >
        <div className="p-6 sm:p-8 text-center">
          <div
            className={`mx-auto mb-5 flex items-center justify-center h-16 w-16 sm:h-20 sm:w-20 rounded-full ${iconContainerBgColor} shadow-md`}
          >
            {icon}
          </div>
          <h1 className={`text-2xl sm:text-3xl font-semibold ${titleColor}`}>
            {title}
          </h1>
        </div>

        <div className="px-6 pb-6 sm:px-8 sm:pb-8 space-y-4">
          <div className="text-center text-slate-600 dark:text-slate-300 text-sm sm:text-base">
            {message}
          </div>

          {children && <div className="pt-4">{children}</div>}

          {orderId && (
            <p className="text-center text-xs sm:text-sm text-slate-500 dark:text-slate-400 pt-2">
              Order ID: <span className="font-medium">{orderId}</span>
            </p>
          )}

          {actions && (
            <div className="pt-5 sm:pt-6 space-y-3 sm:space-y-0 sm:flex sm:flex-wrap sm:gap-3 sm:justify-center">
              {actions}
            </div>
          )}
        </div>
      </div>
      <p className="mt-6 sm:mt-8 text-xs sm:text-sm text-slate-500 dark:text-slate-400 text-center">
        Need help?{' '}
        <Link
          href="/contact-support"
          className="font-medium text-primary hover:underline"
        >
          Contact Support
        </Link>
      </p>
    </div>
  );
};

function CheckoutStatusContent({ params }: { params: { orderId: string } }) {
  const searchParams = useSearchParams();
  const orderId = params.orderId;
  const paymentIntentClientSecret = searchParams?.get(
    'payment_intent_client_secret'
  );
  const redirectStatus = searchParams?.get('redirect_status');
  const isFreeOrder = searchParams?.get('isFree') === 'true';

  const [stripePaymentError, setStripePaymentError] =
    useState<StripeError | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [paymentStatus, setPaymentStatus] = useState<string | null>(null);

  useEffect(() => {
    if (!stripeKey && !isFreeOrder) {
      setIsLoading(false);
      setStripePaymentError({
        type: 'invalid_request_error',
        message: 'Payment system is not configured. Please contact support.',
      });
      toast.error('Payment system configuration error.');
      return;
    }

    if (isFreeOrder) {
      setPaymentStatus('succeeded'); // Treat free orders as immediately succeeded
      setIsLoading(false);
      toast.success('Your free order has been placed!');
      return;
    }

    // Handle cases where redirect_status is present (e.g., after off-site payment)
    // but payment_intent_client_secret might be missing or payment was cancelled.
    if (!paymentIntentClientSecret) {
      if (redirectStatus === 'succeeded') {
        setPaymentStatus('succeeded');
        toast.info('Payment redirect successful. Verifying final status...');
        // Potentially could try to fetch order status from backend if needed
      } else if (redirectStatus) {
        // e.g., 'canceled', 'failed', or other non-succeeded statuses
        setPaymentStatus(redirectStatus);
        setStripePaymentError({
          type: 'validation_error',
          message: `Payment was ${redirectStatus}. If this is an error, please contact support.`,
        });
        toast.warning(`Payment was ${redirectStatus}.`);
      } else {
        // No client secret and no redirect status
        console.warn(
          'Missing payment_intent_client_secret and redirect_status.'
        );
        setStripePaymentError({
          type: 'invalid_request_error',
          message:
            'Payment details are incomplete. If you just completed a payment, please wait a few moments. Otherwise, try checking out again or contact support.',
        });
      }
      setIsLoading(false);
      return;
    }

    const fetchPaymentIntentStatus = async () => {
      setIsLoading(true);
      try {
        const stripe = await stripePromise;
        if (!stripe) {
          toast.error(
            'Error initializing payment system. Please try again or contact support.'
          );
          setStripePaymentError({
            type: 'api_connection_error',
            message: 'Could not connect to payment system.',
          });
          setIsLoading(false);
          return;
        }

        const { paymentIntent, error } = await stripe.retrievePaymentIntent(
          paymentIntentClientSecret
        );

        if (error) {
          console.error('Stripe retrievePaymentIntent error:', error);
          setStripePaymentError(error);
          setPaymentStatus('failed'); // Generic failure
          toast.error(
            error.message ||
              'There was an error retrieving your payment details.'
          );
        } else if (paymentIntent) {
          setPaymentStatus(paymentIntent.status);
          if (paymentIntent.status === 'succeeded') {
            toast.success('Payment confirmed successfully!');
          } else if (paymentIntent.status === 'processing') {
            toast.info('Your payment is currently processing.');
          } else if (
            !['succeeded', 'processing'].includes(paymentIntent.status)
          ) {
            const specificErrorMsg =
              paymentIntent.last_payment_error?.message ||
              `Payment status: ${paymentIntent.status}.`;
            setStripePaymentError({
              type:
                (paymentIntent.last_payment_error
                  ?.type as StripeError['type']) || 'card_error',
              message: specificErrorMsg,
            });
            toast.error(specificErrorMsg);
          }
        }
      } catch (e: unknown) {
        console.error('Exception fetching payment intent status:', e);
        const error = e as Error;
        toast.error(
          'An unexpected error occurred while verifying payment status.'
        );
        setStripePaymentError({
          type: 'api_error', // Generic API error
          message: error.message || 'An unexpected server error occurred.',
        });
      } finally {
        setIsLoading(false);
      }
    };

    fetchPaymentIntentStatus();
  }, [paymentIntentClientSecret, isFreeOrder, redirectStatus, orderId]);

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-slate-100 dark:bg-slate-900">
        <Spinner text={'Verifying Payment Status...'} />
        <p className="text-sm text-muted-foreground mt-3">
          Please wait, this won&apos;t take long.
        </p>
      </div>
    );
  }

  // Error State
  const hasError =
    stripePaymentError ||
    (paymentStatus &&
      ![
        'succeeded',
        'processing',
        'requires_action',
        'requires_payment_method',
        'requires_confirmation',
      ].includes(paymentStatus) &&
      !isFreeOrder);

  if (hasError) {
    const displayError = stripePaymentError || {
      type: 'unknown_error',
      message: `Your payment could not be confirmed (Status: ${paymentStatus || 'unknown'}). Please check your payment method or contact support.`,
    };
    return (
      <StatusDisplay
        icon={<XCircle size={40} className="text-white" />}
        title="Payment Issue"
        message={
          <>
            <p className="mb-3 text-slate-700 dark:text-slate-200">
              We encountered a problem with your payment.
            </p>
            <Alert variant="destructive" className="text-left">
              <AlertTriangle className="h-4 w-4" />
              <AlertTitle>Error Details</AlertTitle>
              <AlertDescription>{displayError.message}</AlertDescription>
            </Alert>
            <p className="mt-4 text-sm text-muted-foreground">
              If the issue persists, please contact our support team or try your
              payment again.
            </p>
          </>
        }
        orderId={orderId}
        actions={
          <>
            <Button asChild className="w-full sm:w-auto">
              <Link href="/checkout">
                <RotateCw className="mr-2 h-4 w-4" /> Try Payment Again
              </Link>
            </Button>
            <Button asChild variant="outline" className="w-full sm:w-auto">
              <Link href="/contact-support">
                <Mail className="mr-2 h-4 w-4" /> Contact Support
              </Link>
            </Button>
          </>
        }
        theme="error"
      />
    );
  }

  // Success or Processing State
  if (
    paymentStatus === 'succeeded' ||
    paymentStatus === 'processing' ||
    isFreeOrder
  ) {
    const isProcessing = paymentStatus === 'processing' && !isFreeOrder;

    let theme: StatusDisplayProps['theme'] = 'success';
    let icon = <PartyPopper size={40} className="text-white" />;
    let title = 'Payment Successful!';
    let primaryMessage = `Thank you! Your payment for order was successful.`;

    if (isFreeOrder) {
      theme = 'free';
      icon = <PartyPopper size={40} className="text-white" />;
      title = 'RSVP Placed!';
      primaryMessage = `Your RSVP has been confirmed successfully.`;
    } else if (isProcessing) {
      theme = 'processing';
      icon = <CreditCard size={40} className="text-white" />; // Or Hourglass, Clock
      title = 'Payment Processing';
      primaryMessage = `Your payment is currently being processed. We'll notify you once it's fully confirmed.`;
    }

    return (
      <StatusDisplay
        icon={icon}
        title={title}
        message={
          <>
            <p className="text-slate-700 dark:text-slate-200">
              {primaryMessage}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              A confirmation email is on its way. Please allow a few minutes for
              it to arrive in your inbox (and check spam!).
            </p>
          </>
        }
        orderId={orderId}
        actions={
          <>
            {orderId && (
              <>
                <Button
                  asChild
                  className="w-full sm:w-auto bg-primary hover:bg-primary/90 text-primary-foreground"
                >
                  <Link href={`/orders/${orderId}`}>
                    <TicketIcon className="mr-2 h-4 w-4" /> View Tickets
                  </Link>
                </Button>
                <Button
                  asChild
                  variant="secondary"
                  className="w-full sm:w-auto"
                >
                  <Link href={`/orders/${orderId}/receipt`}>
                    <FileText className="mr-2 h-4 w-4" /> View Confirmation
                  </Link>
                </Button>
              </>
            )}
            <Button
              asChild
              variant="outline"
              className={`w-full sm:w-auto ${!orderId ? 'sm:col-span-2' : ''}`}
            >
              <Link href="/">
                <Home className="mr-2 h-4 w-4" /> Back to Homepage
              </Link>
            </Button>
          </>
        }
        theme={theme}
      >
        {/* Additional content specific to success/processing can go here */}
        {paymentStatus === 'succeeded' && !isFreeOrder && !isProcessing && (
          <Alert className="mt-5 text-left bg-green-100 dark:bg-green-700/30 border-green-200 dark:border-green-600">
            <PartyPopper className="h-5 w-5 text-green-600 dark:text-green-400" />
            <AlertTitle className="text-green-700 dark:text-green-300">
              Get Ready!
            </AlertTitle>
            <AlertDescription className="text-green-600 dark:text-green-500">
              Your tickets are confirmed. We can&apos;t wait to see you at the
              event!
            </AlertDescription>
          </Alert>
        )}
        {isProcessing && (
          <Alert
            variant="default"
            className="mt-5 text-left bg-blue-100 dark:bg-blue-700/30 border-blue-200 dark:border-blue-600"
          >
            <Info className="h-5 w-5 text-blue-600 dark:text-blue-400" />
            <AlertTitle className="text-blue-700 dark:text-blue-300">
              Sit Tight!
            </AlertTitle>
            <AlertDescription className="text-blue-600 dark:text-blue-500">
              We&apos;re confirming everything on our end. You can safely
              navigate away; we&apos;ll email you an update.
            </AlertDescription>
          </Alert>
        )}
      </StatusDisplay>
    );
  }

  // Fallback / Pending / Ambiguous State (if not loading and no definitive error/success yet)
  return (
    <StatusDisplay
      icon={<Info size={40} className="text-white" />}
      title="Checking Order Status"
      message={
        <>
          <p className="text-slate-700 dark:text-slate-200">
            We&apos;re currently verifying the details of your order.
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            This page should update automatically. If it doesn&apos;t update
            within a minute, please refresh or check your email for a
            confirmation.
          </p>
        </>
      }
      orderId={orderId}
      actions={
        <>
          <Button
            onClick={() => window.location.reload()}
            variant="secondary"
            className="w-full sm:w-auto"
          >
            <RotateCw className="mr-2 h-4 w-4" /> Refresh
          </Button>
          <Button asChild variant="outline" className="w-full sm:w-auto">
            <Link href="/">
              <Home className="mr-2 h-4 w-4" /> Go to Homepage
            </Link>
          </Button>
        </>
      }
      theme="info"
    />
  );
}

export default function CheckoutStatusPage(
  props: {
    params: Promise<{ orderId: string }>;
  }
) {
  const params = use(props.params);
  return (
    <Suspense
      key={params.orderId} // Adding key helps ensure Suspense re-evaluates if orderId changes during navigation
      fallback={
        <div className="flex flex-col justify-center items-center min-h-screen bg-slate-100 dark:bg-slate-900">
          <Spinner text="Loading page..." />
        </div>
      }
    >
      <CheckoutStatusContent params={params} />
    </Suspense>
  );
}
