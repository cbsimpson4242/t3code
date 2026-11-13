import type { ThreadIcon } from "@t3tools/contracts";
import { resolveThreadIcon } from "@t3tools/client-runtime/state/thread-icon";

import { cn } from "~/lib/utils";
import { ProjectFavicon, type ProjectFaviconProject } from "./ProjectFavicon";

/** A thread's logo: the icon a user chose for a No project thread, otherwise its project's logo. */
export function ThreadLogo(input: {
  readonly icon: ThreadIcon | null | undefined;
  readonly project: (ProjectFaviconProject & { readonly isScratch?: boolean | undefined }) | null;
  readonly className?: string | undefined;
}) {
  const icon = resolveThreadIcon({ icon: input.icon }, input.project);
  if (icon?.kind === "emoji") {
    return (
      <span
        aria-hidden="true"
        className={cn(
          "inline-flex size-3.5 shrink-0 items-center justify-center leading-none [container-type:size]",
          input.className,
        )}
      >
        <span className="text-[length:80cqh] leading-none">{icon.emoji}</span>
      </span>
    );
  }
  if (icon?.kind === "image") {
    return (
      <img
        src={icon.dataUrl}
        alt=""
        className={cn("size-3.5 shrink-0 rounded-[25%] object-cover", input.className)}
      />
    );
  }
  return input.project ? (
    <ProjectFavicon project={input.project} className={input.className} />
  ) : null;
}
