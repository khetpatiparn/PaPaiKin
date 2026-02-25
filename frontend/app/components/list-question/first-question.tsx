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
        <Pressable style={questionStyle.item} onPress={handleNext}>
          <Text style={questionStyle.textColor}>จานเดียว</Text>
        </Pressable>

        <Pressable style={questionStyle.item} onPress={handleNext}>
          <Text style={questionStyle.textColor}>เส้น</Text>
        </Pressable>

        <Pressable style={questionStyle.item} onPress={handleNext}>
          <Text style={questionStyle.textColor}>กับข้าว</Text>
        </Pressable>

        <Pressable style={questionStyle.item} onPress={handleNext}>
          <Text style={questionStyle.textColor}>ทานเล่น</Text>
        </Pressable>

        <Pressable style={questionStyle.item} onPress={handleNext}>
          <Text style={questionStyle.textColor}>เครื่องดื่ม</Text>
        </Pressable>

        <Pressable style={questionStyle.item} onPress={handleNext}>
          <Text style={questionStyle.textColor}>ของหวาน</Text>
        </Pressable>

        <Pressable style={questionStyle.item} onPress={handleNext}>
          <Text style={questionStyle.textColor}>อะไรก็ได้</Text>
        </Pressable>
      </View>
    </View>
  )
}

