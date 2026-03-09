import { Stack } from 'expo-router';

export default function HomeLayout() {
  return (
    <Stack>
      <Stack.Screen name="index" options={{ title: "PaPaiKin" }} />
      <Stack.Screen name="control-menu" />
      <Stack.Screen name="guided-menu" />
      <Stack.Screen name="restaurant-listing" />
      <Stack.Screen name="shop-location" />
    </Stack>
  );
}