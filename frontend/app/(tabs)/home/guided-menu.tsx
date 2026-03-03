import { useLocalSearchParams } from "expo-router"
import { View, Text } from "react-native"
import axios from 'axios';
import { useEffect } from "react";

export default function GuidedMenu() {
  // q1=SINGLE_DISH&q2=PORK&q3=DRY
  const answer = useLocalSearchParams();

  useEffect(() => {
    const sendAnswer = async () => {
      try {
        //mobile
        // const response = await axios.post('http://192.168.137.1:3000/shop-menu-item/control-menu', answer);
        //emulator
        const response = await axios.post('http://193.168.79.65:3000/shop-menu-item/control-menu', answer)
        console.log(response.data);
      } catch (error) {
        console.log(error);
      }
    }
    if (answer.q1) {
      sendAnswer()
    }
  }, [answer])

  console.log(answer)


  return (
    <View>
      <Text>this is guided screen</Text>
    </View>
  )
}