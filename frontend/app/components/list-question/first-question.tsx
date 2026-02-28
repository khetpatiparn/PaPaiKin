import { View, Pressable, Text } from "react-native"
import questionStyle from "./style/questionStyle";
import { ListAnswer, FOOD_CATEGORIES } from "./types/type-question";

interface FirstQuestionProps {
  handleNext: (key: keyof ListAnswer, value: ListAnswer[keyof ListAnswer]) => void;
}

export default function FirstQuestion({ handleNext }: FirstQuestionProps) {

  const listQ1 = ["จานเดียว", "เส้น", "กับข้าว", "ทานเล่น", "เครื่องดื่ม", "ของหวาน", "อะไรก็ได้"];

  return (
    <View>
      <Text>Step : 1</Text>
      <Text>Q1 : กินสไตล์ไหน</Text>
      <View style={questionStyle.container}>
        <Pressable style={questionStyle.item} onPress={() => handleNext("q1", FOOD_CATEGORIES.SINGLE_DISH)}>
          <Text style={questionStyle.textColor}>{listQ1[0]}</Text>
        </Pressable>

        <Pressable style={questionStyle.item} onPress={() => handleNext("q1", FOOD_CATEGORIES.NOODLE)}>
          <Text style={questionStyle.textColor}>{listQ1[1]}</Text>
        </Pressable>

        <Pressable style={questionStyle.item} onPress={() => handleNext("q1", FOOD_CATEGORIES.SIDE_DISH)}>
          <Text style={questionStyle.textColor}>{listQ1[2]}</Text>
        </Pressable>

        <Pressable style={questionStyle.item} onPress={() => handleNext("q1", FOOD_CATEGORIES.APPETIZER)}>
          <Text style={questionStyle.textColor}>{listQ1[3]}</Text>
        </Pressable>

        <Pressable style={questionStyle.item} onPress={() => handleNext("q1", FOOD_CATEGORIES.BEVERAGE)}>
          <Text style={questionStyle.textColor}>{listQ1[4]}</Text>
        </Pressable>

        <Pressable style={questionStyle.item} onPress={() => handleNext("q1", FOOD_CATEGORIES.DESSERT)}>
          <Text style={questionStyle.textColor}>{listQ1[5]}</Text>
        </Pressable>

        <Pressable style={questionStyle.item} onPress={() => handleNext("q1", FOOD_CATEGORIES.ANY)}>
          <Text style={questionStyle.textColor}>{listQ1[6]}</Text>
        </Pressable>
      </View>
    </View>
  )
}

