import FontAwesome from '@expo/vector-icons/FontAwesome';
import { Tabs, usePathname } from 'expo-router';

export default function TabLayout() {

  const pathname = usePathname();

  const screensToHideTab = ['/home/control-menu']
  const shouldHideTab = screensToHideTab.includes(pathname);

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: '#FF6B00', // สีส้มตาม Theme PaPaiKin
        tabBarStyle: shouldHideTab ? { display: 'none' } : { display: 'flex' }
      }}
    >
      <Tabs.Screen
        name="home"
        options={{
          title: 'Home',
          tabBarIcon: ({ color }) => <FontAwesome size={28} name="home" color={color} />,
        }}
      />

      <Tabs.Screen
        name="search"
        options={{
          title: 'Search',
          tabBarIcon: ({ color }) => <FontAwesome size={28} name="search" color={color} />,
        }}
      />
    </Tabs>
  );
}

