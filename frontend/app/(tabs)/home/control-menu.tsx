import { useState } from "react";
import { View, Text } from "react-native";

import FirstQuestion from "@/components/list-question/first-question";
import SecondQuestion from "@/components/list-question/second-question";
import ThirdQuestion from "@/components/list-question/third-question";

import { ListAnswer } from "../../../components/list-question/types/type-question";
import { router } from "expo-router";

export default function ControlMenu() {

  const [step, setStep] = useState<number>(1);

  const [answer, setAnswer] = useState<ListAnswer>({})

  const handleNext = (q: keyof ListAnswer, ans: ListAnswer[keyof ListAnswer]) => {
    const updatedAnswer = { ...answer, [q]: ans };
    setAnswer(updatedAnswer);

    if (step === 3) {
      router.navigate({
        pathname: "/(tabs)/home/guided-menu",
        params: updatedAnswer,
      })
      return;
    }

    if (q === 'q1' && (ans === 'BEVERAGE' || ans === 'DESSERT')) {
      router.navigate({
        pathname: "/(tabs)/home/guided-menu",
        params: updatedAnswer,
      })
      return;
    }
    setStep((prevStep) => prevStep + 1)
  }

  return (
    <View>
      {step === 1 && (
        <FirstQuestion handleNext={handleNext} />
      )}

      {step === 2 && (
        <SecondQuestion handleNext={handleNext} />
      )}

      {step === 3 && (
        <ThirdQuestion handleNext={handleNext} />
      )}

      <Text style={{ marginTop: 20 }}>Current Step: {step}</Text>
    </View>
  );
}


