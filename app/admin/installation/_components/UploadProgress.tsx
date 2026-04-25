"use client";

type Props = {
  fileName: string;
  progress: number; // 0–100
};

export function UploadProgress({ fileName, progress }: Props) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between text-xs text-zinc-400">
        <span className="truncate max-w-[70%]">{fileName}</span>
        <span>{Math.round(progress)}%</span>
      </div>
      <div className="h-1 w-full rounded-full bg-zinc-800 overflow-hidden">
        <div
          className="h-full bg-white rounded-full transition-all duration-150"
          style={{ width: `${progress}%` }}
        />
      </div>
    </div>
  );
}
