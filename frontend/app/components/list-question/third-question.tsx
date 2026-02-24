import { View, Pressable, Text } from "react-native"
import questionStyle from "./style/questionStyle";

interface ThirdQuestionProps {
  handleNext: () => void;
}

export default function ThirdQuestion({ handleNext }: ThirdQuestionProps) {
  return (
    <View>
      <Text>Step : 3</Text>
      <Text>Q3 : รูปแบบการปรุง</Text>
      <View style={[questionStyle.container]}>
        <Pressable style={questionStyle.item} onPress={handleNext}>
          <Text style={questionStyle.textColor}>แบบแห้ง (ผัด/ทอด/ย่าง/ยำ)</Text>
        </Pressable>

        <Pressable style={questionStyle.item} onPress={handleNext}>
          <Text style={questionStyle.textColor}>แบบน้ำ (แกง/ต้ม/ซุป)</Text>
        </Pressable>

        <Pressable style={questionStyle.item} onPress={handleNext}>
          <Text style={questionStyle.textColor}>อะไรก็ได้</Text>
        </Pressable>
      </View>
    </View>
  )
}

