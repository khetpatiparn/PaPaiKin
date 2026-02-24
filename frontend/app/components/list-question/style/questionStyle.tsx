import { StyleSheet } from "react-native";

const questionStyle = StyleSheet.create({
  container: {
    borderColor: "red",
    borderWidth: 1,
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 20,
    justifyContent: "center",

    backgroundColor: "grey",
    width: "100%",

  },
  item: {
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "black",
    width: "40%",
    height: 150,
  },
  textColor: {
    // borderColor: "red",
    borderWidth: 1,
    color: "white"
  }
})

export default questionStyle;