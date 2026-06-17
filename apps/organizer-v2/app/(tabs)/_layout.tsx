import { Ionicons } from '@expo/vector-icons';
import { Tabs } from 'expo-router';
import { Text } from 'react-native';
import { fonts } from '../../constants/theme';

export default function TabLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: '#6A63F6',
        tabBarInactiveTintColor: '#8A8A8A',
        tabBarStyle: {
          backgroundColor: '#FFFFFF',
          borderTopColor: 'rgba(0,0,0,0.05)',
          borderTopWidth: 1,
          minHeight: 60,
          paddingBottom: 8,
          paddingTop: 8,
        },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: 'Events',
          tabBarLabel: ({ focused, color }) => (
            <Text
              style={{
                fontFamily: focused ? fonts.bold : fonts.medium,
                fontSize: 12,
                color: color,
              }}
            >
              Events
            </Text>
          ),
          tabBarIcon: ({ color }) => (
            <Ionicons name="calendar-outline" size={26} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="settings"
        options={{
          title: 'Settings',
          tabBarLabel: ({ focused, color }) => (
            <Text
              style={{
                fontFamily: focused ? fonts.bold : fonts.medium,
                fontSize: 12,
                color: color,
              }}
            >
              Settings
            </Text>
          ),
          tabBarIcon: ({ color }) => (
            <Ionicons name="person-outline" size={26} color={color} />
          ),
        }}
      />
    </Tabs>
  );
}
