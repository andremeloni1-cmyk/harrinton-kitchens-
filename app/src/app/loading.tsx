// Branded route-loading screen: the logo mark fades in over the gradient while
// shimmer skeletons stand in for the shell, so the UI is seen loading in.
import { BrandMark } from "@/components/BrandMark";

export default function Loading() {
  return (
    <div className="px-4 pt-6">
      {/* Centered brand mark */}
      <div className="fade-in flex flex-col items-center pt-16">
        <div className="flex h-16 w-16 items-center justify-center rounded-[1.4rem] bg-gradient-to-br from-brand-500 to-brand-600 text-white shadow-lg shadow-brand-600/25">
          <BrandMark className="h-8 w-8" />
        </div>
        <div className="mt-4 h-3 w-32 skeleton rounded-full" />
        <div className="mt-2 h-2.5 w-44 skeleton rounded-full" />
      </div>

      {/* Shell skeletons */}
      <div className="mt-12 space-y-3">
        <div className="skeleton h-16 rounded-bento" />
        <div className="grid grid-cols-3 gap-3">
          <div className="skeleton h-20 rounded-bento" />
          <div className="skeleton h-20 rounded-bento" />
          <div className="skeleton h-20 rounded-bento" />
        </div>
        <div className="skeleton h-28 rounded-bento" />
        <div className="skeleton h-28 rounded-bento" />
      </div>
    </div>
  );
}
