import { useState } from "react";
import { View, Text } from "react-native";

import FirstQuestion from "../components/list-question/first-question";
import SecondQuestion from "../components/list-question/second-question";
import ThirdQuestion from "../components/list-question/third-question";

interface listAnswer {
  q1: string;
  q2: string;
  q3: string;
}

export default function Index() {

  const [step, setStep] = useState<number>(1);

  const [answer, setAnswer] = useState<listAnswer>()

  const handleNext = () => {
    setAnswer()
    setStep(step + 1);
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


