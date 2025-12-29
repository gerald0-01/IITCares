import { Button, Pressable, StyleSheet, Text, TextInput, View } from "react-native";

export default function Index() {

  const styles = StyleSheet.create({
    input: {
      borderWidth: 1,
      width: 250,
      padding: 5,
      margin: 10

    },
    container: {
        flex: 1,
        justifyContent: "center",
        alignItems: "center",
        maxHeight: 300,
    },
    signUp: {
      marginBottom: 40,
      fontSize: 30,
      fontWeight: "bold"
    }
  })

  return (
    <View
      style={{
        flex: 1,
        justifyContent: "center",
        alignItems: "center",
      }}
    >
      <Text style={styles.signUp}>Sign Up</Text>
      <View style={styles.container}>
        <Text>Email</Text>
        <TextInput placeholder="@example.com"style={styles.input}/>
        <Text>Password</Text>
        <TextInput secureTextEntry={true} style={styles.input}/>
        <Text>Confirm Password</Text>
        <TextInput secureTextEntry={true} style={styles.input}/>
      </View>
    </View>
  );
}
