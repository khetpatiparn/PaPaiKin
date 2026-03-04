import { useLocalSearchParams } from "expo-router"
import { View, Text } from "react-native"
import axios from 'axios';

import { useEffect, useState } from "react";

import * as Location from 'expo-location';

interface Coordinates {
  latitude: number;
  longitude: number;
}



export default function GuidedMenu() {
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
      const currentLocation = await Location.getCurrentPositionAsync({});
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
        //mobile
        const response = await axios.post('http://192.168.137.1:3000/shop-menu-item/guided-menu', queryMenu);
        //emulator
        // const response = await axios.post('http://193.168.79.65:3000/shop-menu-item/control-menu', answer)
        // console.log(response.data);
        setGuidedMenus(response.data);
      } catch (error) {
        console.log(error);
      }
    }
    sendAnswer()

  }, [userLocation, answer.q1, answer.q2, answer.q3])

  return (
    <View>
      <Text>this is guided screen</Text>
      <Text>{guidedMenus?.randomMenu?.menuName}</Text>
      <Text>{guidedMenus?.cheapestMenu?.menuName}</Text>
      <Text>{guidedMenus?.nearestMenu?.menuName}</Text>
    </View>
  )
}