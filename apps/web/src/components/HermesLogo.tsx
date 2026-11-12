import { cn } from "../lib/utils";
import hermesLogoDarkUrl from "../assets/hermes/hermes-logo-dark.png";
import hermesLogoLightUrl from "../assets/hermes/hermes-logo-light.png";

/** Bundled Hermes Agent artwork (MIT, Nous Research); the dark variant swaps in with the dark theme. */
export function HermesLogo({ className }: { readonly className?: string }) {
  return (
    <span aria-hidden className={cn("relative inline-flex size-5 shrink-0", className)}>
      <img
        alt=""
        className="size-full object-contain dark:hidden"
        draggable={false}
        src={hermesLogoLightUrl}
      />
      <img
        alt=""
        className="hidden size-full object-contain dark:block"
        draggable={false}
        src={hermesLogoDarkUrl}
      />
    </span>
  );
}
