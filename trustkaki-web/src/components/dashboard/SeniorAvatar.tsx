"use client";

import Image from "next/image";
import { useState } from "react";
import { initialsForSenior } from "./careWorkspacePresentation";

const sizes = { sm: 36, md: 48, lg: 64 } as const;

export function shouldShowAvatarFallback(src: string | null, failed: boolean): boolean {
  return !src || failed;
}

export function SeniorAvatar(props: {
  name: string;
  src: string | null;
  size?: keyof typeof sizes;
}) {
  const [failed, setFailed] = useState(false);
  const pixels = sizes[props.size ?? "md"];
  const fallback = shouldShowAvatarFallback(props.src, failed);

  return (
    <span
      className="relative grid aspect-square shrink-0 place-items-center overflow-hidden rounded-full border border-[var(--care-line)] bg-[var(--care-soft-teal)] font-bold text-[var(--care-brand)]"
      style={{ width: pixels, height: pixels }}
      aria-hidden="true"
    >
      <span>{initialsForSenior(props.name)}</span>
      {!fallback && props.src && (
        <Image
          alt=""
          src={props.src}
          width={pixels}
          height={pixels}
          className="absolute inset-0 h-full w-full object-cover"
          onError={() => setFailed(true)}
        />
      )}
    </span>
  );
}
