import { View, Pressable, Text } from "react-native"
import questionStyle from "./style/questionStyle";

interface SecondQuestionProps {
  handleNext: () => void;
}

export default function SecondQuestion({ handleNext }: SecondQuestionProps) {

  return (
    <View>
      <Text>Step : 2</Text>
      <Text>Q2 : เลือกเนื้อสัตว์</Text>
      <View style={questionStyle.container}>
        <Pressable style={questionStyle.item} onPress={handleNext}>
          <Text style={questionStyle.textColor}>หมู</Text>
        </Pressable>

        <Pressable style={questionStyle.item} onPress={handleNext}>
          <Text style={questionStyle.textColor}>ไก่</Text>
        </Pressable>

        <Pressable style={questionStyle.item} onPress={handleNext}>
          <Text style={questionStyle.textColor}>เนื้อ</Text>
        </Pressable>

        <Pressable style={questionStyle.item} onPress={handleNext}>
          <Text style={questionStyle.textColor}>ทะเล</Text>
        </Pressable>

        <Pressable style={questionStyle.item} onPress={handleNext}>
          <Text style={questionStyle.textColor}>ไม่ทานเนื้อ</Text>
        </Pressable>

        <Pressable style={questionStyle.item} onPress={handleNext}>
          <Text style={questionStyle.textColor}>อะไรก็ได้</Text>
        </Pressable>
      </View>
    </View>
  )
}

