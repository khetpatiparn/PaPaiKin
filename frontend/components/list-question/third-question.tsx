import { View, Pressable, Text } from "react-native"
import questionStyle from "./style/questionStyle";
import { ListAnswer, COOKING_METHOD } from "./types/type-question";

interface ThirdQuestionProps {
  handleNext: (key: keyof ListAnswer, value: ListAnswer[keyof ListAnswer]) => void;
}

export default function ThirdQuestion({ handleNext }: ThirdQuestionProps) {

  const listQ3 = ["แบบแห้ง (ผัด/ทอด/ย่าง/ยำ/อบแห้ง)", "แบบน้ำ (แกง/ต้ม/ซุป/ลวก/นึ่ง)", "อะไรก็ได้"]

  const shuffleCookingMethod = [
    COOKING_METHOD.DRY,
    COOKING_METHOD.SOUP,
  ]

  return (
    <View>
      <Text>Step : 3</Text>
      <Text>Q3 : รูปแบบการปรุง</Text>
      <View style={[questionStyle.container]}>
        <Pressable style={questionStyle.item} onPress={() => handleNext("q3", COOKING_METHOD.DRY)}>
          <Text style={questionStyle.textColor}>{listQ3[0]}</Text>
        </Pressable>

        <Pressable style={questionStyle.item} onPress={() => handleNext("q3", COOKING_METHOD.SOUP)}>
          <Text style={questionStyle.textColor}>{listQ3[1]}</Text>
        </Pressable>

        <Pressable style={questionStyle.item} onPress={() => {
          const random = shuffleCookingMethod[Math.floor(Math.random() * shuffleCookingMethod.length)];
          handleNext('q3', random)
        }}>
          <Text style={questionStyle.textColor}>{listQ3[2]}</Text>
        </Pressable>
      </View>
    </View>
  )
}

