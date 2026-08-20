import AntDesign from '@expo/vector-icons/AntDesign';
import {
  AppleButton,
  appleAuth,
} from '@invertase/react-native-apple-authentication';
import {
  AppleAuthProvider,
  GoogleAuthProvider,
  getAuth,
  signInWithCredential,
  signInWithEmailAndPassword,
} from '@react-native-firebase/auth';
import { GoogleSignin } from '@react-native-google-signin/google-signin';
import { router } from 'expo-router';
import { useState } from 'react';
import {
  Image,
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  TouchableWithoutFeedback,
  View,
} from 'react-native';
import { TextField } from 'react-native-ui-lib';

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    padding: 20,
    backgroundColor: 'white',
  },
  label: {
    fontSize: 16,
    color: '#333',
    marginBottom: 6,
    fontWeight: '500',
    marginTop: 12,
  },
  input: {
    width: '100%',
    backgroundColor: '#fff',
    paddingVertical: 16,
    paddingHorizontal: 16,
    borderRadius: 5,
    borderWidth: 1,
    borderColor: '#ccc',
    fontSize: 16,
    color: '#000',
  },
  button: {
    backgroundColor: '#007bff',
    borderRadius: 5,
    borderColor: '#ccc',
    borderWidth: 1,
    width: '100%',
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'center',
    marginTop: 12,
    height: 50,
  },
  buttonText: {
    color: '#fff',
    fontSize: 18,
  },
  iconContainer: {
    marginRight: 6,
  },
});

export default function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  GoogleSignin.configure({
    webClientId: process.env.EXPO_PUBLIC_WEB_CLIENT_ID,
  });

  function signInWithEmail() {
    signInWithEmailAndPassword(getAuth(), email, password)
      .then(() => {
        router.replace('/(tabs)');
      })
      .catch((error) => {
        console.log('Error signing in:', error);
      });
  }

  async function handleGoogleSignIn() {
    await GoogleSignin.hasPlayServices({ showPlayServicesUpdateDialog: true });
    const account = await GoogleSignin.signIn();
    const idToken = account.data?.idToken;

    const googleCredential = GoogleAuthProvider.credential(idToken ?? null);

    return signInWithCredential(getAuth(), googleCredential)
      .then((user) => {
        router.replace('/(tabs)');
      })
      .catch((error) => {
        console.log('Error signing in with Google:', error);
      });
  }

  async function onAppleButtonPress() {
    const appleAuthRequestResponse = await appleAuth.performRequest({
      requestedOperation: appleAuth.Operation.LOGIN,
      requestedScopes: [appleAuth.Scope.FULL_NAME, appleAuth.Scope.EMAIL],
    });

    if (!appleAuthRequestResponse.identityToken) {
      throw new Error('Apple Sign-In failed - no identify token returned');
    }

    const { identityToken, nonce } = appleAuthRequestResponse;
    const appleCredential = AppleAuthProvider.credential(identityToken, nonce);

    return signInWithCredential(getAuth(), appleCredential)
      .then(() => {
        router.replace('/(tabs)');
      })
      .catch((error) => {
        console.log('Error signing in:', error);
      });
  }

  return (
    <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={-250}
        style={styles.container}
      >
        <View
          style={{
            alignItems: 'center',
            marginBottom: 48,
          }}
        >
          <Image
            resizeMode="cover"
            style={{
              width: 150,
              height: 150,
              justifyContent: 'center',
              alignContent: 'center',
            }}
            source={require('@/assets/logo/logo_v1.png')}
          />
        </View>
        <Text style={styles.label}>Email Address</Text>
        <TextInput
          style={styles.input}
          placeholder="Enter your email"
          placeholderTextColor="#999"
          onChangeText={setEmail}
        />
        <Text style={styles.label}>Password</Text>

        <TextField
          placeholder="**************"
          secureTextEntry
          value={password}
          onChangeText={setPassword}
          placeholderTextColor="#999"
          containerStyle={styles.input}
          showClearButton={true}
        />

        <TouchableOpacity
          style={{
            ...styles.button,
            backgroundColor: '#DB4437',
            marginTop: 24,
          }}
          onPress={signInWithEmail}
          activeOpacity={0.8}
        >
          <View style={styles.iconContainer}>
            <AntDesign name="mail" size={16} color="white" />
          </View>
          <Text
            style={{
              color: 'white',
              fontSize: 18,
              fontWeight: '500',
            }}
          >
            Sign in with Email
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={{
            ...styles.button,
            backgroundColor: '#4285F4',
          }}
          onPress={handleGoogleSignIn}
          activeOpacity={0.8}
        >
          <View style={styles.iconContainer}>
            <AntDesign name="google" size={16} color="white" />
          </View>
          <Text
            style={{
              color: 'white',
              fontSize: 18,
              fontWeight: '500',
            }}
          >
            Sign in with Google
          </Text>
        </TouchableOpacity>
        {Platform.OS === 'ios' && (
          <AppleButton
            buttonStyle={AppleButton.Style.BLACK}
            buttonType={AppleButton.Type.SIGN_IN}
            textStyle={{
              fontSize: 22,
              color: '#000',
            }}
            style={{
              width: '100%',
              borderRadius: 5,
              borderColor: '#000',
              borderWidth: 0.5,
              height: 50,
              marginTop: 12,
            }}
            onPress={onAppleButtonPress}
          />
        )}
      </KeyboardAvoidingView>
    </TouchableWithoutFeedback>
  );
}
