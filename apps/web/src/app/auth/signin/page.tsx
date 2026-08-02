import { EmailAuthForm } from '../_components/EmailAuthForm';

export default function SignInPage() {
  return (
    <>
      <div className="max-w-3xl mx-auto text-center pb-8">
        <h1 className="text-4xl md:text-5xl font-bold text-foreground mb-4">
          Welcome back.
        </h1>
        <p className="text-xl text-muted-foreground">
          Sign in to your TropTix account
        </p>
      </div>

      <EmailAuthForm />
    </>
  );
}
