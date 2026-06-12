import { EmailAuthForm } from '../_components/EmailAuthForm';

export default function SignUpPage() {
  return (
    <>
      {/* Page header */}
      <div className="max-w-3xl mx-auto text-center pb-8">
        <h1 className="text-4xl md:text-5xl font-bold text-gray-900 mb-4">
          Welcome to TropTix.
        </h1>
        <p className="text-xl text-gray-600">
          Create your account to get started
        </p>
      </div>

      <EmailAuthForm />
    </>
  );
}
