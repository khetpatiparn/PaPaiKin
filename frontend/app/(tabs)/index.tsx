import { useState } from "react";
import { View, Text } from "react-native";
import axios from 'axios';


import FirstQuestion from "../components/list-question/first-question";
import SecondQuestion from "../components/list-question/second-question";
import ThirdQuestion from "../components/list-question/third-question";

import { ListAnswer } from "../components/list-question/types/type-question";

export default function Index() {

  const [step, setStep] = useState<number>(1);

  const [answer, setAnswer] = useState<ListAnswer>({})

  // send answer
  const sendAnswer = async () => {
    axios.post('http://localhost:3000/menu/control-menu', answer)
      .then(function (response) {
        console.log(response);
      })
      .catch(function (error) {
        console.log(error);
      });
  }

  const handleNext = (q: keyof ListAnswer, ans: ListAnswer[keyof ListAnswer]) => {
    if (step < 3) {
      setAnswer((prevAns) => ({
        ...prevAns,
        [q]: ans
      }))
      setStep((prevStep) => prevStep + 1)
    }else {
      console.log('stepvalue =',step)
      sendAnswer()
    }
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


