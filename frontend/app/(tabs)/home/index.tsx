import { useRouter } from "expo-router"
import { View, Text, Button } from "react-native"

export default function Index() {

  const router = useRouter();

  return (
    <View>
      <Text>this is index screen</Text>
      <Button title="randomize"
        onPress={() => router.navigate('/(tabs)/home/control-menu')}>
      </Button>

    </View>
  )
}
