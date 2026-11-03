import { act, useEffect } from 'react';
import { createRoot, type Root } from 'react-dom/client';

const mockSignIn = jest.fn();
let widgetMounts = 0;

jest.mock('@/lib/supabaseAuth', () => ({
  signInWithMagicLink: (...args: unknown[]) => mockSignIn(...args),
  verifyEmailOtp: jest.fn(),
  signInWithGoogle: jest.fn(),
}));
jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: jest.fn(), refresh: jest.fn() }),
}));
jest.mock('sonner', () => ({
  toast: { error: jest.fn(), success: jest.fn() },
}));
jest.mock('@marsidev/react-turnstile', () => ({
  Turnstile: ({
    onSuccess,
    onError,
  }: {
    onSuccess: (token: string) => void;
    onError: () => void;
  }) => {
    useEffect(() => {
      widgetMounts += 1;
    }, []);
    return (
      <div>
        <button type="button" onClick={() => onSuccess(`tok-${widgetMounts}`)}>
          solve
        </button>
        <button type="button" onClick={() => onError()}>
          fail
        </button>
      </div>
    );
  },
}));

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;
// input-otp measures its container with APIs jsdom does not implement.
globalThis.ResizeObserver = class {
  observe() {}
  unobserve() {}
  disconnect() {}
};
document.elementFromPoint = () => null;

let EmailAuthForm: typeof import('./EmailAuthForm').EmailAuthForm;
let container: HTMLDivElement;
let root: Root;

beforeAll(async () => {
  process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY = 'test-site-key';
  ({ EmailAuthForm } = await import('./EmailAuthForm'));
});

beforeEach(() => {
  mockSignIn.mockReset().mockResolvedValue({ error: null });
  widgetMounts = 0;
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => root.render(<EmailAuthForm />));
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  jest.useRealTimers();
});

function button(text: string) {
  const found = Array.from(container.querySelectorAll('button')).find((b) =>
    b.textContent?.includes(text)
  );
  if (!found) throw new Error(`No button "${text}"`);
  return found;
}

async function click(text: string) {
  await act(async () => button(text).click());
}

function typeEmail(value: string) {
  const input = container.querySelector(
    'input[type=email]'
  ) as HTMLInputElement;
  const setValue = Object.getOwnPropertyDescriptor(
    HTMLInputElement.prototype,
    'value'
  )!.set!;
  act(() => {
    setValue.call(input, value);
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
}

test('waits for a token, sends it, and gets a fresh one for the resend', async () => {
  jest.useFakeTimers();
  typeEmail('buyer@example.com');
  expect(button('Email me a sign-in link').disabled).toBe(true);

  await click('solve');
  await click('Email me a sign-in link');

  expect(mockSignIn).toHaveBeenCalledWith('buyer@example.com', 'tok-1');
  expect(container.textContent).toContain('Check your email');
  expect(widgetMounts).toBe(2);

  for (let s = 0; s < 45; s++) act(() => jest.advanceTimersByTime(1000));
  expect(button('resend the code').disabled).toBe(true);

  await click('solve');
  await click('resend the code');
  expect(mockSignIn).toHaveBeenLastCalledWith('buyer@example.com', 'tok-2');
});

test('sends without a token when the widget errors', async () => {
  typeEmail('buyer@example.com');
  await click('fail');
  await click('Email me a sign-in link');

  expect(mockSignIn).toHaveBeenCalledWith('buyer@example.com', undefined);
});
