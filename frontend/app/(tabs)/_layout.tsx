import FontAwesome from '@expo/vector-icons/FontAwesome';
import { Tabs } from 'expo-router';

export default function TabLayout() {
  return (
    <Tabs screenOptions={{ tabBarActiveTintColor: 'blue' }}>
      <Tabs.Screen
        name="index"
        options={{
          title: 'Home',
          tabBarIcon: ({ color }) => <FontAwesome size={28} name="home" color={color} />,
        }}
      />

      <Tabs.Screen
        name="list"
        options={{
          title: 'List',
          tabBarIcon: ({ color }) => <FontAwesome size={28} name="list" color={color} />,
        }}
      />
    </Tabs>
  );
}

