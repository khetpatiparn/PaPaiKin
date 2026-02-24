import { View, Pressable, Text } from "react-native"
import questionStyle from "./style/questionStyle";

interface FirstQuestionProps {
  handleNext: () => void;
}

export default function FirstQuestion({ handleNext }: FirstQuestionProps) {

  return (
    <View>
      <Text>Step : 1</Text>
      <Text>Q1 : กินสไตล์ไหน</Text>
      <View style={questionStyle.container}>
        <Pressable style={questionStyle.item} onPress={handleNext("อาหารจานเดียว")}>
          <Text style={questionStyle.textColor}>อาหารจานเดียว</Text>
        </Pressable>

        <Pressable style={questionStyle.item} onPress={handleNext("เมนูเส้น")}>
          <Text style={questionStyle.textColor}>เมนูเส้น</Text>
        </Pressable>

        <Pressable style={questionStyle.item} onPress={handleNext("กับข้าว/ทานเล่น")}>
          <Text style={questionStyle.textColor}>กับข้าว/ทานเล่น</Text>
        </Pressable>

        <Pressable style={questionStyle.item} onPress={handleNext("เครื่องดื่ม")}>
          <Text style={questionStyle.textColor}>เครื่องดื่ม</Text>
        </Pressable>

        <Pressable style={questionStyle.item} onPress={handleNext("ของหวาน")}>
          <Text style={questionStyle.textColor}>ของหวาน</Text>
        </Pressable>

        <Pressable style={questionStyle.item} onPress={handleNext("อะไรก็ได้")}>
          <Text style={questionStyle.textColor}>อะไรก็ได้</Text>
        </Pressable>
      </View>
    </View>
  )
}

