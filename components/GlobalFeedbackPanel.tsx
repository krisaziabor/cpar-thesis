"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { AnimatePresence } from "framer-motion";
import RightPanel from "@/components/RightPanel";
import FeedbackPanel from "@/components/FeedbackPanel";

export default function GlobalFeedbackPanel() {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();

  const panel = searchParams.get("panel");
  const homeHasRightPanel =
    pathname === "/" &&
    (searchParams.get("item") != null || searchParams.get("connectPanel") === "1");
  const isOpen = panel === "feedback" && pathname !== "/login" && pathname !== "/onboarding" && !homeHasRightPanel;

  function closePanel() {
    const params = new URLSearchParams(searchParams.toString());
    params.delete("panel");
    const nextQuery = params.toString();
    router.push(nextQuery ? `${pathname}?${nextQuery}` : pathname);
  }

  return (
    <AnimatePresence>
      {isOpen && (
        <RightPanel key="global-feedback-panel" title="Feedback" onClose={closePanel}>
          <FeedbackPanel />
        </RightPanel>
      )}
    </AnimatePresence>
  );
}
