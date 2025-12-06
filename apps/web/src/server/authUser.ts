import { cookies } from 'next/headers';
import { getFirebaseAdmin } from './lib/firebaseAdmin';

export async function getUserFromIdTokenCookie(token?: string) {
  const cookieStore = await cookies();
  const idToken = token || cookieStore.get('fb-token')?.value; // Get the ID Token from cookie

  if (!idToken) {
    console.log('No ID token cookie found.');
    return null;
  }

  try {
    const admin = getFirebaseAdmin();
    const decodedToken = await admin
      .auth()
      .verifyIdToken(idToken /*, checkRevoked = false */);
    return decodedToken;
  } catch (error: any) {
    if (error.code === 'auth/id-token-expired') {
      console.error('ID token has expired');
    } else {
      console.error(
        'Error verifying ID token cookie:',
        error.code,
        error.message
      );
    }
    return null;
  }
}
