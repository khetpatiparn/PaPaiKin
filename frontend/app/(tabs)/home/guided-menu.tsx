import { useLocalSearchParams, useRouter } from "expo-router"
import { View, Text, StyleSheet, ScrollView, ActivityIndicator, Button, Pressable } from "react-native"
import axios from 'axios';

import { useEffect, useState } from "react";

import * as Location from 'expo-location';

interface Coordinates {
  latitude: number;
  longitude: number;
}

export default function GuidedMenu() {
  const router = useRouter();

  // userAnswer => q1=SINGLE_DISH&q2=PORK&q3=DRY
  const answer = useLocalSearchParams();

  // user location
  const [status, requestPermission] = Location.useForegroundPermissions();
  const [userLocation, setUserLocation] = useState<Coordinates | null>(null);

  // response data
  const [guidedMenus, setGuidedMenus] = useState<any>(null);

  useEffect(() => {
    const getLocation = async () => {
      if (status?.status !== "granted") {
        await requestPermission();
        return;
      }
      // ลอง lastKnown ก่อน (ไม่ trigger dialog)
      const lastKnown = await Location.getLastKnownPositionAsync();
      if (lastKnown) {
        setUserLocation({
          latitude: lastKnown.coords.latitude,
          longitude: lastKnown.coords.longitude,
        });
        return;
      }
      // fallback ถ้าไม่มี cache
      const currentLocation = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Lowest,
      });
      setUserLocation({
        latitude: currentLocation.coords.latitude,
        longitude: currentLocation.coords.longitude,
      });
    };
    getLocation();
  }, [status, requestPermission]);

  useEffect(() => {
    if (!userLocation || !answer.q1) return;
    const queryMenu = {
      userAnswer: answer,
      userLocation: userLocation
    }

    // send answer
    const sendAnswer = async () => {
      try {
        // mobile
        // const response = await axios.post('http://192.168.137.1:3000/shop-menu-item/guided-menu', queryMenu);
        // emulator
        // const response = await axios.post('http://193.168.79.65:3000/shop-menu-item/guided-menu', queryMenu)
        // web
        const response = await axios.post('http://localhost:3000/shop-menu-item/guided-menu', queryMenu)
        // console.log(response.data);
        setGuidedMenus(response.data);
      } catch (error) {
        console.log(error);
      }
    }
    sendAnswer()

  }, [userLocation, answer.q1, answer.q2, answer.q3])

  const pathToRestaurantListing = "/(tabs)/home/restaurant-listing";

  return (
    <ScrollView style={{ flex: 1, padding: 16 }}>
      <Text style={{ fontSize: 20, fontWeight: 'bold', marginBottom: 16 }}>Guided Menu Result</Text>

      {!guidedMenus ? (
        <ActivityIndicator />
      ) : guidedMenus.cheapestMenu === null && guidedMenus.nearestMenu === null ? (
        <View>
          <Text>ไม่พบเมนูที่ตรงกับตัวเลือกของคุณ</Text>
          <Button title="ลองเลือกใหม่" onPress={() => router.navigate("/(tabs)/home")} />
        </View>
      ) : (
        <View style={{ gap: 12 }}>
          <Pressable onPress={() => router.navigate({
            pathname: pathToRestaurantListing,
            params: {
              menuId: guidedMenus.randomMenu.menuId,
              menuName: guidedMenus.randomMenu.menuName,
              menuImage: guidedMenus.randomMenu.menuImage,
            },
          })}>
            <Text style={{ fontWeight: 'bold' }}>--- แนะนำ ---</Text>
            <Text>{JSON.stringify(guidedMenus.randomMenu, null, 2)}</Text>
          </Pressable>

          <Pressable onPress={() => router.navigate({
            pathname: pathToRestaurantListing,
            params: {
              menuId: guidedMenus.cheapestMenu.menuId,
              menuName: guidedMenus.cheapestMenu.menuName,
              menuImage: guidedMenus.cheapestMenu.menuImage,
            },
          })}>
            <Text style={{ fontWeight: 'bold' }}>--- ถูกที่สุด ---</Text>
            <Text>{JSON.stringify(guidedMenus.cheapestMenu, null, 2)}</Text>
          </Pressable>

          <Pressable onPress={() => router.navigate({
            pathname: pathToRestaurantListing,
            params: {
              menuId: guidedMenus.nearestMenu.menuId,
              menuName: guidedMenus.nearestMenu.menuName,
              menuImage: guidedMenus.nearestMenu.menuImage,
            },
          })}>
            <Text style={{ fontWeight: 'bold' }}>--- ใกล้ที่สุด ---</Text>
            <Text>{JSON.stringify(guidedMenus.nearestMenu, null, 2)}</Text>
          </Pressable>

          <Text style={{ fontWeight: 'bold' }}>--- ระยะทาง [cheapest, nearest, random] ---</Text>
          <Text>{JSON.stringify(guidedMenus.distanceCards, null, 2)}</Text>
        </View>
      )}
    </ScrollView>
  )
}

// ===================== Styles =====================
const styles = StyleSheet.create({});