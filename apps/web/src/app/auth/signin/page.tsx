import { EmailAuthForm } from '../_components/EmailAuthForm';

export default function SignInPage() {
  return (
    <>
      {/* Page header */}
      <div className="max-w-3xl mx-auto text-center pb-8">
        <h1 className="text-4xl md:text-5xl font-bold text-gray-900 mb-4">
          Welcome back.
        </h1>
        <p className="text-xl text-gray-600">Sign in to your TropTix account</p>
      </div>

      <EmailAuthForm />
    </>
  );
}
