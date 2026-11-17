import type { CSSProperties } from 'react';
import {
  ArrowLeft,
  ArrowRight,
  Check as CheckIcon,
  Minus,
  Plus,
  Share2,
  Ticket,
  X,
} from 'lucide-react';
import {
  BrandMark,
  Field,
  Phone,
  Roll,
  Spinner,
  Stage,
  States,
  type Act,
} from '../../kit';
import './troptix.css';

// TropTix on a phone: every event page takes its colors from its flyer, and
// checkout is a few taps. Beats: the finger swipes from a sunset boat party
// (coral wash) to a soca brunch (green wash) to Neon Nights (dark, pink);
// Get Tickets raises a checkout in Neon's colors; one tap adds a ticket and
// the total rolls; the saved details and card go straight through to Pay;
// Order confirmed holds. Closing it and swiping on brings the sunset page
// back in from the right, which is where the loop began.
//
// The theme variables are the real output of apps/web/src/lib/flyerTheme.ts
// (deriveThemeVars) for palettes matching each drawn flyer.
//
// Screens are in iPhone points (402 wide); the stage crops below ~600pt.

type Step = 'select' | 'details' | 'pay' | 'done';
type S = {
  ev: number;
  dx: number;
  dragging: boolean;
  open: boolean;
  step: Step;
  qty: number;
  held: number;
  paying: boolean;
};

const START: S = {
  ev: 0,
  dx: 0,
  dragging: false,
  open: false,
  step: 'select',
  qty: 0,
  held: 599,
  paying: false,
};
const POSTER: S = {
  ev: 2,
  dx: 0,
  dragging: false,
  open: true,
  step: 'done',
  qty: 1,
  held: 597,
  paying: true,
};

type Theme = Record<string, string>;

const SUNSET: Theme = {
  '--background': 'hsl(356 41% 94%)',
  '--foreground': 'hsl(356 30% 14%)',
  '--card': 'hsl(0 0% 100%)',
  '--primary': 'hsl(356 83% 62%)',
  '--primary-foreground': 'hsl(356 55% 9%)',
  '--muted': 'hsl(356 41% 91%)',
  '--muted-foreground': 'hsl(356 18% 40%)',
  '--accent': 'hsl(241 44% 88%)',
  '--border': 'hsl(356 41% 85%)',
};

const SOCA: Theme = {
  '--background': 'hsl(155 35% 94%)',
  '--foreground': 'hsl(155 30% 14%)',
  '--card': 'hsl(0 0% 100%)',
  '--primary': 'hsl(47 92% 35%)',
  '--primary-foreground': 'hsl(47 55% 9%)',
  '--muted': 'hsl(155 35% 91%)',
  '--muted-foreground': 'hsl(155 18% 36%)',
  '--accent': 'hsl(155 50% 88%)',
  '--border': 'hsl(155 35% 85%)',
};

const NEON: Theme = {
  '--background': 'hsl(255 34% 10%)',
  '--foreground': 'hsl(255 12% 94%)',
  '--card': 'hsl(255 31% 14%)',
  '--primary': 'hsl(328 100% 62%)',
  '--primary-foreground': 'hsl(328 55% 9%)',
  '--muted': 'hsl(255 28% 17%)',
  '--muted-foreground': 'hsl(255 10% 60%)',
  '--accent': 'hsl(188 86% 53%)',
  '--border': 'hsl(255 28% 24%)',
};

type Event = {
  key: string;
  name: string;
  when: string;
  where: string;
  from: string;
  countdown: string;
  theme: Theme;
  dark?: boolean;
};

const EVENTS: Event[] = [
  {
    key: 'sunset',
    name: 'Sunset Boat Party',
    when: 'Sat, Dec 13 · 4:00 PM EST',
    where: 'Montego Bay',
    from: '$45.00',
    countdown: 'In 3 days',
    theme: SUNSET,
  },
  {
    key: 'soca',
    name: 'Soca Brunch',
    when: 'Sun, Dec 14 · 11:00 AM EST',
    where: 'Emancipation Park, Kingston',
    from: '$60.00',
    countdown: 'In 4 days',
    theme: SOCA,
  },
  {
    key: 'neon',
    name: 'Neon Nights',
    when: 'Fri, Dec 19 · 10:00 PM EST',
    where: 'Negril',
    from: '$45.00',
    countdown: 'In 9 days',
    theme: NEON,
    dark: true,
  },
];
// The sunset page again past the end, so the loop's last swipe lands on the opening picture
const TRACK = [...EVENTS, EVENTS[0]!];
const BUY = 2;

const PRICE = 4500;
const FEE = 450;
const money = (cents: number) => `$${(cents / 100).toFixed(2)}`;
const clock = (sec: number) =>
  `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, '0')}`;

const REST = { x: 400, y: 250 };

async function swipe(a: Act<S>) {
  const flyer = a.rect('flyer');
  const y = flyer.y + flyer.height * 0.55;
  const from = flyer.x + flyer.width * 0.82;
  await a.move({ x: from, y });
  await a.wait(120);
  await a.drag(
    { x: flyer.x + flyer.width * 0.3, y },
    (at) => a.put({ dragging: true, dx: at.x - from }),
    {
      duration: 260,
      path: (t, a0, b0) => ({ x: a0.x + (b0.x - a0.x) * t, y: a0.y }),
    }
  );
  a.put((s) => ({ ev: s.ev + 1, dx: 0, dragging: false }));
  await a.wait(520);
}

const script = async (a: Act<S>) => {
  await a.wait(900);
  a.mark('swipe');
  await swipe(a);
  await a.wait(650);
  await swipe(a);
  await a.wait(700);
  a.mark('open');
  await a.click({ at: 'get', x: 0.7, y: 0.6 });
  a.put({ open: true });
  await a.wait(750);
  a.mark('add');
  await a.click('add');
  a.put({ qty: 1 });
  await a.wait(800);
  a.mark('continue');
  await a.click({ at: 'continue', x: 0.72, y: 0.6 });
  a.put({ step: 'details' });
  await a.wait(750);
  await a.click({ at: 'to-pay', x: 0.72, y: 0.6 });
  a.put({ step: 'pay' });
  await a.wait(800);
  a.put((s) => ({ held: s.held - 1 }));
  await a.wait(300);
  a.mark('pay');
  await a.click({ at: 'pay', x: 0.74, y: 0.6 });
  a.put({ paying: true });
  await a.wait(600);
  a.put((s) => ({ held: s.held - 1 }));
  await a.wait(500);
  a.mark('done');
  a.put({ step: 'done' });
  await a.wait(2300);
  a.mark('close');
  await a.click('close');
  a.put({ open: false });
  await a.wait(650);
  // The sheet is off screen: reset the checkout unseen
  await a.snap({ step: 'select', qty: 0, held: 599, paying: false });
  a.mark('return');
  await swipe(a);
  // The copy of the sunset page is the same picture as the first one
  await a.snap({ ev: 0 });
  await a.move(REST);
};

function Flyer({
  kind,
  className,
  ...rest
}: { kind: string; className?: string } & Record<`data-${string}`, unknown>) {
  if (kind === 'soca')
    return (
      <div className={`tx-flyer tx-flyer--soca ${className ?? ''}`} {...rest}>
        <span className="tx-soca__sun" />
        <span className="tx-soca__ring" />
        <span className="tx-soca__leaf tx-soca__leaf--a" />
        <span className="tx-soca__leaf tx-soca__leaf--b" />
        <span className="tx-poster tx-poster--soca">
          <span>Soca</span>
          <span>Brunch</span>
        </span>
      </div>
    );
  if (kind === 'neon')
    return (
      <div className={`tx-flyer tx-flyer--neon ${className ?? ''}`} {...rest}>
        <span className="tx-neon__grid" />
        <span className="tx-neon__ring tx-neon__ring--pink" />
        <span className="tx-neon__ring tx-neon__ring--cyan" />
        <span className="tx-poster tx-poster--neon">
          <span>Neon</span>
          <span>Nights</span>
        </span>
      </div>
    );
  return (
    <div className={`tx-flyer tx-flyer--sunset ${className ?? ''}`} {...rest}>
      <span className="tx-sunset__sun" />
      <span className="tx-sunset__sea" />
      <span className="tx-sunset__boat" />
      <span className="tx-poster tx-poster--sunset">
        <span>Sunset</span>
        <span>Boat Party</span>
      </span>
    </div>
  );
}

function Stepper({ qty, target }: { qty: number; target?: string }) {
  return (
    <span className="tx-stepper" data-on={qty > 0 || undefined}>
      <span className="tx-stepper__less">
        <span className="tx-stepper__minus">
          <Minus size={16} strokeWidth={2.25} />
        </span>
        <span className="tx-stepper__count">
          <Roll>{String(Math.max(qty, 1))}</Roll>
        </span>
      </span>
      <span className="tx-stepper__plus" data-target={target}>
        <Plus size={16} strokeWidth={2.25} />
      </span>
    </span>
  );
}

export default function TropTixCheckout() {
  return (
    <Stage<S>
      width={440}
      height={533}
      compact={{ below: 440, width: 358, height: 515 }}
      initial={START}
      poster={POSTER}
      script={script}
      cursor={{ at: REST, style: 'touch' }}
      className="tx"
    >
      {(s, _rect, layout) => {
        const buy = EVENTS[BUY]!;
        const total = s.qty * (PRICE + FEE);
        const fees = s.qty * FEE;
        const onDark = (s.open ? buy : TRACK[s.ev]!).dark ?? false;
        return (
          <>
            <div className="tx-wash" data-ev={TRACK[s.ev]!.key} />
            <Phone
              width={layout === 'compact' ? 318 : 340}
              className="tx-phone"
              dark={onDark}
            >
              <div
                className="tx-track"
                data-dragging={s.dragging || undefined}
                style={{
                  transform: `translateX(calc(${-s.ev * 100}% + ${s.dx * 1.18}px))`,
                }}
              >
                {TRACK.map((e, i) => (
                  <div
                    key={i}
                    className="tx-event"
                    style={e.theme as CSSProperties}
                  >
                    <div className="tx-event__flyer-wrap">
                      <Flyer
                        kind={e.key}
                        className="tx-event__flyer"
                        data-target={i === s.ev ? 'flyer' : undefined}
                      />
                      <span className="tx-round tx-round--l">
                        <ArrowLeft size={20} strokeWidth={2} />
                      </span>
                      <span className="tx-round tx-round--r">
                        <Share2 size={18} strokeWidth={2} />
                      </span>
                      <span className="tx-countdown">
                        <span className="tx-countdown__dot" />
                        {e.countdown}
                      </span>
                    </div>
                    <div className="tx-event__body">
                      <span className="tx-event__name">{e.name}</span>
                      <span className="tx-event__meta">{e.when}</span>
                      <span className="tx-event__meta">{e.where}</span>
                    </div>
                    <div className="tx-event__foot">
                      <div className="tx-event__from">
                        <span className="tx-muted">From</span>
                        <span className="tx-strong">{e.from}</span>
                      </div>
                      <span
                        className="tx-cta tx-cta--inline"
                        data-target={i === BUY ? 'get' : undefined}
                      >
                        Get Tickets <ArrowRight size={18} strokeWidth={2.25} />
                      </span>
                    </div>
                  </div>
                ))}
              </div>

              <div
                className="tx-sheet"
                data-open={s.open || undefined}
                data-step={s.step}
                style={buy.theme as CSSProperties}
              >
                <span className="tx-close" data-target="close">
                  <X size={20} strokeWidth={2} />
                </span>

                <section
                  className="tx-pane"
                  data-on={s.step === 'select' || undefined}
                >
                  <header className="tx-head">
                    <span className="tx-title">Choose tickets</span>
                    <span className="tx-sub">{buy.name}</span>
                  </header>
                  <div className="tx-list">
                    <div
                      className="tx-type"
                      data-picked={s.qty > 0 || undefined}
                    >
                      <div className="tx-type__text">
                        <span className="tx-type__name">General admission</span>
                        <span className="tx-type__price">
                          <b>$45.00</b>{' '}
                          <span className="tx-muted">+ $4.50 fees</span>
                        </span>
                      </div>
                      <Stepper qty={s.qty} target="add" />
                    </div>
                    <div className="tx-type">
                      <div className="tx-type__text">
                        <span className="tx-type__name">VIP table</span>
                        <span className="tx-type__price">
                          <b>$120.00</b>{' '}
                          <span className="tx-muted">+ $12.00 fees</span>
                        </span>
                      </div>
                      <Stepper qty={0} />
                    </div>
                    <div className="tx-type tx-type--out">
                      <div className="tx-type__text">
                        <span className="tx-type__name">Early bird</span>
                        <span className="tx-type__price">
                          <b>$35.00</b>
                        </span>
                      </div>
                      <span className="tx-pill">Sold out</span>
                    </div>
                  </div>
                  <footer className="tx-foot">
                    <div className="tx-total">
                      <div className="tx-total__label">
                        <span className="tx-strong-sm">Total</span>
                        <span className="tx-muted tx-small">
                          <Roll>
                            {s.qty > 0
                              ? `1 ticket · incl. ${money(fees)} fees`
                              : 'incl. fees'}
                          </Roll>
                        </span>
                      </div>
                      <span className="tx-total__amount">
                        <Roll align="end">{money(total)}</Roll>
                      </span>
                    </div>
                    <span
                      className="tx-cta"
                      data-target="continue"
                      data-off={s.qty === 0 || undefined}
                    >
                      Continue
                    </span>
                  </footer>
                </section>

                <section
                  className="tx-pane tx-pane--short"
                  data-on={s.step === 'details' || undefined}
                >
                  <header className="tx-head tx-head--back">
                    <span className="tx-back">
                      <ArrowLeft size={20} strokeWidth={2} />
                    </span>
                    <span className="tx-head__text">
                      <span className="tx-title">Your details</span>
                      <span className="tx-sub">{buy.name}</span>
                    </span>
                  </header>
                  <div className="tx-form">
                    <div className="tx-row2">
                      <Field label="First name" value="Maya" />
                      <Field label="Last name" value="Thompson" />
                    </div>
                    <Field label="Email" value="maya@gmail.com" />
                    <span className="tx-muted tx-small">
                      Your tickets and receipt are sent here.
                    </span>
                  </div>
                  <footer className="tx-foot tx-foot--bare">
                    <span className="tx-cta" data-target="to-pay">
                      Continue to payment
                    </span>
                  </footer>
                </section>

                <section
                  className="tx-pane tx-paypane"
                  data-on={s.step === 'pay' || undefined}
                >
                  <div className="tx-payhead">
                    <span className="tx-muted tx-strong-sm">Back</span>
                    <span className="tx-muted tx-held">
                      Held for <Roll>{clock(s.held)}</Roll>
                    </span>
                  </div>
                  <div className="tx-summary">
                    <span className="tx-strong">{buy.name}</span>
                    <span className="tx-muted tx-small">{buy.when}</span>
                    <div className="tx-lines">
                      <span className="tx-line">
                        <span>1 × General admission</span>
                        <span>$45.00</span>
                      </span>
                      <span className="tx-line tx-muted">
                        <span>Service fees</span>
                        <span>$4.50</span>
                      </span>
                      <span className="tx-line tx-line--total">
                        <span>Total</span>
                        <span>$49.50</span>
                      </span>
                    </div>
                  </div>
                  <div className="tx-card">
                    <span className="tx-card__label">Card number</span>
                    <span className="tx-card__field">
                      <span>4242 4242 4242 4242</span>
                      <BrandMark brand="visa" size={16} surface="dark" />
                    </span>
                    <div className="tx-row2">
                      <span className="tx-card__cell">
                        <span className="tx-card__label">Expiration</span>
                        <span className="tx-card__field">12 / 28</span>
                      </span>
                      <span className="tx-card__cell">
                        <span className="tx-card__label">CVC</span>
                        <span className="tx-card__field">123</span>
                      </span>
                    </div>
                  </div>
                  <span className="tx-cta tx-cta--pay" data-target="pay">
                    <States
                      value={s.paying ? 'busy' : 'idle'}
                      states={{
                        idle: <span>Pay $49.50</span>,
                        busy: (
                          <span className="tx-busy">
                            <span className="tx-busy__spin">
                              <Spinner size={16} />
                            </span>
                            Processing…
                          </span>
                        ),
                      }}
                    />
                  </span>
                </section>

                <section
                  className="tx-pane tx-done"
                  data-on={s.step === 'done' || undefined}
                >
                  <span className="tx-done__name">{buy.name}</span>
                  <span className="tx-done__meta">
                    {buy.where}
                    <br />
                    Fri, Dec 19 at 10:00 PM
                  </span>
                  <span className="tx-done__ok">
                    <CheckIcon size={16} strokeWidth={2.5} /> Order confirmed ·
                    1 ticket
                  </span>
                  <Flyer kind={buy.key} className="tx-done__flyer" />
                  <div className="tx-done__actions">
                    <span className="tx-dark">
                      <Ticket size={20} strokeWidth={2} /> View tickets
                    </span>
                    <span className="tx-share">
                      <Share2 size={20} strokeWidth={2} />
                    </span>
                  </div>
                </section>
              </div>
            </Phone>
          </>
        );
      }}
    </Stage>
  );
}
