import type { ComponentProps, ReactNode } from "react";
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View, useColorScheme } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import type { ThemeMode } from "../../../src/lib/types";

const palettes = {
  light: { canvas: "#f7f6fa", panel: "#ffffff", ink: "#211b2f", quiet: "#5e566c", line: "#ddd5e7", accent: "#542bc1", accentInk: "#ffffff" },
  lavender: { canvas: "#f5f0fd", panel: "#fffdff", ink: "#211b2f", quiet: "#5e566c", line: "#dfd4ee", accent: "#542bc1", accentInk: "#ffffff" },
  dark: { canvas: "#181421", panel: "#252031", ink: "#f6efff", quiet: "#c7bdd6", line: "#514760", accent: "#c9b6ff", accentInk: "#211344" },
};
import { createContext, useContext } from "react";

const Palette = createContext(palettes.lavender);
export function Appearance({ mode, children }: { mode?: ThemeMode; children: ReactNode }) {
  const system = useColorScheme();
  return <Palette.Provider value={palettes[mode ?? (system === "dark" ? "dark" : "lavender")]}>{children}</Palette.Provider>;
}
export const usePalette = () => useContext(Palette);

const s = StyleSheet.create({
  body: { paddingHorizontal: 20, paddingTop: 18, paddingBottom: 36, gap: 16, maxWidth: 700, width: "100%", alignSelf: "center" },
  title: { fontSize: 33, lineHeight: 39, fontWeight: "800", letterSpacing: -1 },
  heading: { fontSize: 19, fontWeight: "700" },
  text: { fontSize: 16, lineHeight: 23 },
  card: { borderWidth: 1, borderRadius: 22, padding: 17, gap: 10 },
  button: { minHeight: 48, borderRadius: 16, paddingHorizontal: 15, paddingVertical: 11, alignItems: "center", justifyContent: "center", borderWidth: 1 },
  field: { minHeight: 49, borderWidth: 1, borderRadius: 13, paddingHorizontal: 13, paddingVertical: 10, fontSize: 16 },
  row: { flexDirection: "row", flexWrap: "wrap", gap: 9 },
});

export function Page({ title, intro, children }: { title: string; intro?: string; children?: ReactNode }) {
  const palette = usePalette();
  return <SafeAreaView edges={["left", "right"]} style={{ flex: 1, backgroundColor: palette.canvas }}>
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <ScrollView contentContainerStyle={s.body} keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag">
        <Text accessibilityRole="header" style={[s.title, { color: palette.ink }]}>{title}</Text>
        {intro && <Copy muted>{intro}</Copy>}
        {children}
      </ScrollView>
    </KeyboardAvoidingView>
  </SafeAreaView>;
}

export function Card({ title, children }: { title?: string; children: ReactNode }) {
  const p = usePalette();
  return <View style={[s.card, { backgroundColor: p.panel, borderColor: p.line }]}>
    {title && <Text accessibilityRole="header" style={[s.heading, { color: p.ink }]}>{title}</Text>}
    {children}
  </View>;
}

export function Copy({ children, muted = false, live = false }: { children: ReactNode; muted?: boolean; live?: boolean }) {
  const p = usePalette();
  return <Text accessibilityLiveRegion={live ? "polite" : undefined} style={[s.text, { color: muted ? p.quiet : p.ink }]}>{children}</Text>;
}

export function Action({ label, onPress, primary = false, disabled = false, selected }: {
  label: string; onPress: () => void; primary?: boolean; disabled?: boolean; selected?: boolean;
}) {
  const p = usePalette();
  return <Pressable accessibilityRole="button" accessibilityState={{ disabled, selected }}
    onPress={onPress} disabled={disabled}
    style={({ pressed }) => [s.button, { borderColor: primary ? p.accent : p.line, backgroundColor: primary ? p.accent : p.panel, opacity: disabled ? 0.48 : pressed ? 0.72 : 1 }]}>
    <Text style={{ color: primary ? p.accentInk : p.ink, fontSize: 16, fontWeight: "700", textAlign: "center" }}>{label}</Text>
  </Pressable>;
}

export function Field({ label, ...props }: ComponentProps<typeof TextInput> & { label: string }) {
  const p = usePalette();
  return <View style={{ gap: 5 }}>
    <Copy>{label}</Copy>
    <TextInput {...props} accessibilityLabel={label} placeholderTextColor={p.quiet} style={[s.field, { color: p.ink, backgroundColor: p.panel, borderColor: p.line, textAlignVertical: props.multiline ? "top" : "center", minHeight: props.multiline ? 100 : 49 }]} />
  </View>;
}

export function Row({ children }: { children: ReactNode }) {
  return <View style={s.row}>{children}</View>;
}
