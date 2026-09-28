// Served in place of https://js.stripe.com/*/stripe.js by lib/test.ts. It
// implements only what @stripe/react-stripe-js/checkout and PaymentStep touch:
// initCheckoutElementsSdk → loadActions/on/createPaymentElement, a session with
// canConfirm, and confirm(), which asks the fake Stripe server for the outcome.
(function () {
  const FAKE_STRIPE_URL = '__FAKE_STRIPE_URL__';

  function fieldMarkup() {
    return [
      '<div style="display:grid;gap:8px">',
      '<label>Card number <input name="cardNumber" autocomplete="cc-number" inputmode="numeric" placeholder="1234 1234 1234 1234"></label>',
      '<label>Expiration <input name="cardExpiry" autocomplete="cc-exp" placeholder="MM / YY"></label>',
      '<label>CVC <input name="cardCvc" autocomplete="cc-csc" placeholder="CVC"></label>',
      '</div>',
    ].join('');
  }

  function createPaymentElement(state) {
    const handlers = {};
    let root = null;
    return {
      mount(node) {
        root = document.createElement('div');
        root.innerHTML = fieldMarkup();
        root
          .querySelector('[name=cardNumber]')
          .addEventListener('input', (e) => {
            state.card = e.target.value.replace(/\s+/g, '');
          });
        node.appendChild(root);
        queueMicrotask(() => (handlers.ready || []).forEach((cb) => cb()));
      },
      on(event, cb) {
        (handlers[event] ||= []).push(cb);
      },
      off(event, cb) {
        handlers[event] = (handlers[event] || []).filter((h) => h !== cb);
      },
      update() {},
      destroy() {
        if (root) root.remove();
        root = null;
      },
    };
  }

  function initCheckoutElementsSdk(options) {
    const state = { card: '' };
    const session = {
      id: options.clientSecret.split('_secret_')[0],
      canConfirm: true,
      currency: 'usd',
      livemode: false,
      status: { type: 'open' },
      lineItems: [],
    };
    async function confirm() {
      const res = await fetch(`${FAKE_STRIPE_URL}/e2e/confirm`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          clientSecret: options.clientSecret,
          card: state.card,
        }),
      });
      const body = await res.json();
      if (!res.ok) {
        return {
          type: 'error',
          error: {
            code: 'paymentFailed',
            message: body.error ? body.error.message : 'Payment failed.',
            paymentFailed: { declineCode: null },
          },
        };
      }
      if (body.declined) {
        return {
          type: 'error',
          error: {
            code: 'paymentFailed',
            message: 'Your card has been declined.',
            paymentFailed: { declineCode: body.declineCode },
          },
        };
      }
      return {
        type: 'success',
        session: { ...session, status: { type: 'complete' } },
      };
    }
    return {
      on() {},
      loadActions: async () => ({
        type: 'success',
        actions: { getSession: () => session, confirm },
      }),
      createPaymentElement: () => createPaymentElement(state),
      getPaymentElement: () => null,
      changeAppearance() {},
      loadFonts() {},
    };
  }

  const unsupported = () => {
    throw new Error('Not implemented by the e2e Stripe.js shim.');
  };

  function Stripe() {
    return {
      // react-stripe-js checks these four exist before accepting the object.
      elements: unsupported,
      createToken: unsupported,
      createPaymentMethod: unsupported,
      confirmCardPayment: unsupported,
      _registerWrapper() {},
      registerAppInfo() {},
      initCheckoutElementsSdk,
    };
  }
  Stripe.version = 'dahlia';
  window.Stripe = Stripe;
})();
