import { createFileRoute } from "@tanstack/react-router";
import { OWNER, StoreProvider, useStore } from "@/lib/store";
import { PhoneFrame, Shell } from "@/components/sc/Shell";
import { Setup } from "@/components/sc/Setup";
import { Bills, Home, People, PersonDetail, Replies, Settings, Summary } from "@/components/sc/owner";
import { Decision } from "@/components/sc/Decision";
import { ColleaguePage } from "@/components/sc/Colleague";
import { Toast } from "@/components/sc/ui";
import { AiLog } from "@/components/sc/AiLog";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Shared Collect — Razorpay Agent Studio" },
      { name: "description", content: "Split a fixed monthly cost with colleagues, bill everyone, and handle late payments. AI reads and proposes, rules compute every rupee, you approve." },
      { property: "og:title", content: "Shared Collect — Razorpay Agent Studio" },
      { property: "og:description", content: "AI reads and proposes. Rules compute every rupee. You approve." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Index,
});

function Owner() {
  const { s, evalView } = useStore();
  if (evalView) return <AiLog />;
  if (s.stage !== "live" && s.stage !== "replies") return <Setup />;
  if (s.stage === "replies") return <Replies />;
  const v = s.view;
  if (v === "people") return <People />;
  if (v === "settings") return <Settings />;
  if (v === "bills") return <Bills />;
  if (v === "summary") return <Summary />;
  if (v.startsWith("decision:")) return <Decision id={v.slice(9)} />;
  if (v.startsWith("person:")) return <PersonDetail pid={v.slice(7)} />;
  return <Home />;
}

function App() {
  const { s, evalView } = useStore();
  if (!evalView && s.role !== OWNER && s.people.some((p) => p.id === s.role))
    return (
      <PhoneFrame>
        <ColleaguePage pid={s.role} />
        <Toast />
      </PhoneFrame>
    );
  return (
    <Shell>
      <Owner />
      <Toast />
    </Shell>
  );
}

function Index() {
  return (
    <StoreProvider>
      <App />
    </StoreProvider>
  );
}
