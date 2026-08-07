import Generation from "./generation";
import GenerationBg from "./generation-bg";

/**
 * The right column's frame: the pane background and the ambient backdrop.
 *
 * Deliberately unpadded. The gutter belongs to the transcript inside `Generation`,
 * not to the pane — padding here would inset the whole column, so the step overlay
 * couldn't reach the pane edges and the floating toggle would float inside the
 * gutter rather than over it.
 *
 * A query container, so everything inside sizes against this pane rather than the
 * window. The pane is half the window, which is exactly the width a viewport
 * breakpoint gets wrong: `2xl:` would fire here at 1536px of window and 768px of
 * actual room. Safe to contain because nothing in this column is `fixed` —
 * containment would make this the containing block for anything that was.
 */
export default function GenerationWrapper() {
  return (
    <div className="@container relative h-full min-h-0 overflow-hidden bg-[#080808]">
      <Generation />
      <GenerationBg />
    </div>
  );
}
