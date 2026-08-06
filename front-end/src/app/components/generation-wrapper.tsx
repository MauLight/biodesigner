import Generation from "./generation";
import GenerationBg from "./generation-bg";

/**
 * The right column's frame: the pane background and the ambient backdrop.
 *
 * Deliberately unpadded. The gutter belongs to the transcript inside `Generation`,
 * not to the pane — padding here would inset the whole column, so the step overlay
 * couldn't reach the pane edges and the floating toggle would float inside the
 * gutter rather than over it.
 */
export default function GenerationWrapper() {
  return (
    <div className="relative h-full min-h-0 overflow-hidden bg-[#080808]">
      <Generation />
      <GenerationBg />
    </div>
  );
}
