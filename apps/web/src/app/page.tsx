import LandingHero from './_components/hero';
import PoweredBy from './_components/powered-by';
import Features from './_components/features';
import CTA from './_components/cta';
import About from './_components/about';

export default function Home() {
  return (
    <main>
      <LandingHero />
      <PoweredBy />
      {/* <Features /> */}
      <CTA />
      <About />
    </main>
  );
}
