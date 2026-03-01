import { View, Pressable, Text } from "react-native"
import questionStyle from "./style/questionStyle";
import { ListAnswer, INGREDIENTS } from "./types/type-question";

interface SecondQuestionProps {
  handleNext: (key: keyof ListAnswer, value: ListAnswer[keyof ListAnswer]) => void;
}

export default function SecondQuestion({ handleNext }: SecondQuestionProps) {

  const listQ2 = ["หมู", "ไก่", "เนื้อ", "ทะเล", "ไม่ทานเนื้อ", "อะไรก็ได้"];

  const shuffleIngredients = [
    INGREDIENTS.PORK,
    INGREDIENTS.CHICKEN,
    INGREDIENTS.BEEF,
    INGREDIENTS.SEAFOOD,
    INGREDIENTS.VEGETARIAN,
  ]

  return (
    <View>
      <Text>Step : 2</Text>
      <Text>Q2 : เลือกเนื้อสัตว์</Text>
      <View style={questionStyle.container}>
        <Pressable style={questionStyle.item} onPress={() => handleNext("q2", INGREDIENTS.PORK)}>
          <Text style={questionStyle.textColor}>{listQ2[0]}</Text>
        </Pressable>

        <Pressable style={questionStyle.item} onPress={() => handleNext("q2", INGREDIENTS.CHICKEN)}>
          <Text style={questionStyle.textColor}>{listQ2[1]}</Text>
        </Pressable>

        <Pressable style={questionStyle.item} onPress={() => handleNext("q2", INGREDIENTS.BEEF)}>
          <Text style={questionStyle.textColor}>{listQ2[2]}</Text>
        </Pressable>

        <Pressable style={questionStyle.item} onPress={() => handleNext("q2", INGREDIENTS.SEAFOOD)}>
          <Text style={questionStyle.textColor}>{listQ2[3]}</Text>
        </Pressable>

        <Pressable style={questionStyle.item} onPress={() => handleNext("q2", INGREDIENTS.VEGETARIAN)}>
          <Text style={questionStyle.textColor}>{listQ2[4]}</Text>
        </Pressable>

        <Pressable style={questionStyle.item} onPress={() => {
          const random = shuffleIngredients[Math.floor(Math.random() * shuffleIngredients.length)];
          handleNext('q2', random)
        }}>
          <Text style={questionStyle.textColor}>{listQ2[5]}</Text>
        </Pressable>
      </View>
    </View>
  )
}

