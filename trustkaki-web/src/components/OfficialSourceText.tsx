import { Fragment } from "react";
import { isOfficialActivitySource } from "@/lib/activities/sourceLinks";

export default function OfficialSourceText({ text }: { text: string }) {
  return <>{text.split(/(https:\/\/[^\s<>()（），。；]+)/g).map((part, index) => {
    const url = part.replace(/[.,;!]+$/, "");
    if (!isOfficialActivitySource(url)) return <Fragment key={index}>{part}</Fragment>;
    return <Fragment key={index}><a href={url} target="_blank" rel="noopener noreferrer"
      className="break-all text-[var(--care-evergreen)] underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-offset-2">{url}</a>{part.slice(url.length)}</Fragment>;
  })}</>;
}
