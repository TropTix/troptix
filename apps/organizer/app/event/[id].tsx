import { useFetchEventById } from '@/hooks/useFetchEvents';
import { createMaterialTopTabNavigator } from '@react-navigation/material-top-tabs';
import { useLocalSearchParams } from 'expo-router';
import { Text, View } from 'react-native';
import CheckInPage from './checkin';
import Scanner from './scanner';

const Tab = createMaterialTopTabNavigator();

export default function EventDetails() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { isPending, isError, data, error } = useFetchEventById(id);

  return (
    <View style={{ height: '100%', backgroundColor: 'white' }}>
      {isPending ? (
        <View
          style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}
        >
          <Text>Loading...</Text>
        </View>
      ) : (
        <Tab.Navigator>
          <Tab.Screen name="Scan Tickets">
            {() => <Scanner event={data} />}
          </Tab.Screen>
          <Tab.Screen name="Check In">
            {() => <CheckInPage event={data} />}
          </Tab.Screen>
        </Tab.Navigator>
      )}
    </View>
  );
}
