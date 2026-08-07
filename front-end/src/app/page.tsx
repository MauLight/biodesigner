import Generator from "./components/generator";
import { SessionProvider } from "@/lib/session";
import { KeysProvider } from "@/lib/keys";
import KeysGate from "./components/keys-gate";
// `Generation` and `GenerationBg` are rendered by `GenerationWrapper`, not here.
import GenerationWrapper from "./components/generation-wrapper";

export default function Home() {
  return (
    <div className="h-screen bg-black">
      {/* Outside the gate and the session both: the gate reads the key, and the
          form that changes it — reached from the left column — is the same
          component the gate renders. */}
      <KeysProvider>
        <KeysGate>
          {/* Two equal columns: controls on the left, output on the right. Both
              read the same session, so the provider wraps the grid. This file
              stays a Server Component; only the providers and their consumers
              are client. */}
          <SessionProvider>
            <div className="h-full w-full grid grid-cols-2 grid-rows-1">
              {/* The left column's own layout lives in Generator — it changes
                  once a conversation starts, so it has to react to session
                  state. */}
              <div className="relative col-span-1 h-full min-h-0">
                <Generator />
              </div>
              <GenerationWrapper />
            </div>
          </SessionProvider>
        </KeysGate>
      </KeysProvider>
    </div>
  );
}
