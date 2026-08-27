import { getAuth } from '@react-native-firebase/auth';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Stack, useRouter } from 'expo-router';
import { User } from 'firebase/auth';
import { createContext, useContext, useEffect, useState } from 'react';
import { Text, View } from 'react-native';

const AuthContext = createContext<{
  user: User | undefined;
  jwtToken?: string | undefined;
}>({
  user: undefined,
  jwtToken: undefined,
});
export const useAuth = () => useContext(AuthContext);
const queryClient = new QueryClient();

export default function RootLayout() {
  const [user, setUser] = useState<User | undefined>(undefined);
  const [jwtToken, setJwtToken] = useState<string | undefined>(undefined);
  const [loading, setLoading] = useState(true);
  const router = useRouter();

  useEffect(() => {
    const unsubscribe = getAuth().onAuthStateChanged(async (authUser) => {
      if (!authUser) {
        setLoading(false);
        return;
      }

      const token = await authUser
        .getIdToken(true)
        .then(function (idToken) {
          return idToken;
        })
        .catch(function (error) {
          return undefined;
        });

      setUser(authUser);
      setJwtToken(token);
      setLoading(false);
    });
    return () => unsubscribe();
  }, []);

  if (loading) {
    return (
      <View
        style={{
          flex: 1,
          justifyContent: 'center',
          alignItems: 'center',
          backgroundColor: 'white',
        }}
      >
        <Text>Loading...</Text>
      </View>
    );
  }

  return (
    <QueryClientProvider client={queryClient}>
      <AuthContext.Provider value={{ user, jwtToken }}>
        <Stack screenOptions={{ headerShown: false }}>
          <Stack.Screen name="index" options={{ headerShown: false }} />
          <Stack.Screen
            name="event/[id]"
            options={{
              headerTitle: 'Event Details',
              headerShown: true,
              headerBackButtonDisplayMode: 'generic',
            }}
          />
        </Stack>
      </AuthContext.Provider>
    </QueryClientProvider>
  );
}
