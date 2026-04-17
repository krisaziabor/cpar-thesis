/**
 * Title + subtitle header used at the top of right-panel bodies
 * (ActivityPanel, SearchPanel, FeedbackPanel, ConnectPanel, HoldsPanel).
 *
 * The `size` prop chooses between the small `text-sm` variant most panels
 * use and the larger `text-lg` variant used by HoldsPanel.
 */
export default function PanelIntro({
  title,
  subtitle,
  size = "sm",
}: {
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  size?: "sm" | "base" | "lg";
}) {
  const titleClass =
    size === "lg"
      ? "font-lector text-lg text-zinc-100"
      : size === "base"
      ? "font-lector text-base text-zinc-300"
      : "font-lector text-sm text-zinc-300";
  return (
    <div className="space-y-1">
      <p className={titleClass}>{title}</p>
      {subtitle && <p className="text-xs text-zinc-500">{subtitle}</p>}
    </div>
  );
}
