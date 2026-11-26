import { useState } from "react";
import { useRouter } from "expo-router";
import { Action, Card, Copy, Page, Row } from "./ui";

const steps = [
  { title: "Build a day", detail: "Log study hours and completed topics in Daily Capture. Topics you complete can enter your revision queue.", action: "Open Daily Capture", href: "/capture" },
  { title: "Work from a plan", detail: "Create a weekly Roadmap and add objectives and milestones. They also appear under Study in Goals and can be updated during Capture.", action: "Open Roadmap", href: "/plan" },
  { title: "Revise on schedule", detail: "The revision queue shows what is due. Recording a revision updates connected habits automatically.", action: "Open Revision", href: "/module/revision" },
  { title: "Track Life readings", detail: "Record sleep, movement and other readings in Life. On an evening check-in, confirm the time before recording bedtime.", action: "Open Life", href: "/life" },
  { title: "Check synchronization", detail: "Home shows whether your edits are saved on this device or synchronized with your cloud account.", action: "Open Home", href: "/" },
] as const;

export function Tour() {
  const router = useRouter();
  const [step, setStep] = useState(0);
  const item = steps[step];
  return <Page title="Quick tour" intro={`Step ${step + 1} of ${steps.length}`}>
    <Card title={item.title}>
      <Copy>{item.detail}</Copy>
      <Action label={item.action} onPress={() => router.push(item.href)} />
    </Card>
    <Row>
      <Action label="Previous" disabled={step === 0} onPress={() => setStep(step - 1)} />
      {step < steps.length - 1 ? <Action label="Next" primary onPress={() => setStep(step + 1)} />
        : <Action label="Finish tour" primary onPress={() => router.canGoBack() ? router.back() : router.replace("/")} />}
    </Row>
  </Page>;
}
