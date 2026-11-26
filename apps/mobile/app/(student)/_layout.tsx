import { Tabs, useRouter } from "expo-router";
import { Text, type ColorValue } from "react-native";
import { Gate } from "../../src/gate";
import { usePalette } from "../../src/ui";

const tabIcon = (symbol: string, badge = false) => {
  function TabIcon({ color }: { color: ColorValue }) {
    return <Text accessibilityElementsHidden importantForAccessibility="no" style={{
      color: badge ? "#ffffff" : color, fontSize: badge ? 27 : 22, fontWeight: badge ? "800" : "600",
      backgroundColor: badge ? "#542bc1" : "transparent", borderRadius: 18, minWidth: 36, textAlign: "center",
    }}>{symbol}</Text>;
  }
  return TabIcon;
};

export default function StudentTabs() {
  const router = useRouter();
  const p = usePalette();
  return <Gate><Tabs screenOptions={{
    headerStyle: { backgroundColor: p.canvas },
    headerTintColor: p.ink, tabBarActiveTintColor: p.accent, tabBarInactiveTintColor: p.quiet,
    tabBarStyle: { backgroundColor: p.panel, borderTopColor: p.line },
  }}>
    <Tabs.Screen name="index" options={{ title: "Home", tabBarIcon: tabIcon("⌂") }} />
    <Tabs.Screen name="plan" options={{ title: "Plan", tabBarIcon: tabIcon("▤") }} />
    <Tabs.Screen name="add" options={{ title: "Capture", tabBarIcon: tabIcon("+", true) }} listeners={{ tabPress: (event) => { event.preventDefault(); router.push("/capture"); } }} />
    <Tabs.Screen name="life" options={{ title: "Life", tabBarIcon: tabIcon("♡") }} />
    <Tabs.Screen name="more" options={{ title: "More", tabBarIcon: tabIcon("···") }} />
  </Tabs></Gate>;
}
