"use client";

type Source = "native" | "custom" | "none";

type Props = {
  value: Source;
  onChange: (v: Source) => void;
  nativeUrl: string | null;
  disabled?: boolean;
};

export function ThumbnailSourceSelector({ value, onChange, nativeUrl, disabled }: Props) {
  const options: { id: Source; label: string; description: string; disabledReason?: string }[] = [
    {
      id: "native",
      label: "Use record's existing thumbnail",
      description: nativeUrl
        ? "The record's current thumbnail image."
        : "This record has no native thumbnail.",
      disabledReason: nativeUrl ? undefined : "No native thumbnail available for this record.",
    },
    {
      id: "custom",
      label: "Upload custom image",
      description: "Replace with a custom jpg or png.",
    },
    {
      id: "none",
      label: "No thumbnail",
      description: "Panel shows no visual anchor (full-bleed media or blank).",
    },
  ];

  return (
    <div className="space-y-2">
      {options.map((opt) => {
        const isDisabled = disabled || !!opt.disabledReason;
        const checked = value === opt.id;
        return (
          <label
            key={opt.id}
            className={[
              "flex cursor-pointer items-start gap-3 rounded-lg border px-3 py-3 transition-colors",
              checked ? "border-white/30 bg-white/5" : "border-zinc-800 hover:border-zinc-700",
              isDisabled ? "cursor-not-allowed opacity-40" : "",
            ].join(" ")}
          >
            <input
              type="radio"
              name="thumbnail-source"
              value={opt.id}
              checked={checked}
              disabled={isDisabled}
              onChange={() => !isDisabled && onChange(opt.id)}
              className="mt-0.5 accent-white"
            />
            <span className="flex-1">
              <span className="block text-sm text-zinc-200">{opt.label}</span>
              <span className="block text-xs text-zinc-500 mt-0.5">
                {opt.disabledReason ?? opt.description}
              </span>
            </span>
            {opt.id === "native" && nativeUrl && (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={nativeUrl}
                alt=""
                className="h-10 w-10 flex-shrink-0 rounded object-cover"
              />
            )}
          </label>
        );
      })}
    </div>
  );
}
