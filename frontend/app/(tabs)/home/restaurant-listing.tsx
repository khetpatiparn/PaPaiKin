import { useLocalSearchParams } from "expo-router";
import { View, Text } from "react-native"
import { useEffect, useState } from "react";
import axios from 'axios';

export default function RestaurantListing() {
  const { menuId, menuName, menuImage } = useLocalSearchParams<{ menuId: string, menuName: string, menuImage: string }>();

  const [restaurants, setRestaurants] = useState<any[]>([]);

  useEffect(() => {
    if (!menuId) return;
    const getRestaurants = async () => {
      try {
        // mobile
        // const response = await axios.get(`http://192.168.137.1:3000/shop-menu-item/restaurant-listing/${menuId}`);
        // emulator
        // const response = await axios.get(`http://193.168.79.65:3000/shop-menu-item/restaurant-listing/${menuId}`)
        // web
        const response = await axios.get(`http://localhost:3000/shop-menu-item/restaurant-listing/${menuId}`)
        setRestaurants(response.data);
      } catch (error) {
        console.log(error);
      }
    }
    getRestaurants();
  }, [menuId])

  return (
    <View>
      <Text>menuId : {menuId}</Text>
      <Text>ชื่อเมนู : {menuName}</Text>
      <Text>รูปเมนู : {menuImage}</Text>

      <View>
        <Text>รายการร้านอาหาร | จำนวนร้าน {restaurants.length}</Text>
      </View>
    </View>
  )
}