"use client";
import { useEffect } from "react";
import { useRouter } from "next/navigation";

/** While a sync is queued or running, re-load the page data every 20 seconds. */
export default function AutoRefresh({ active }: { active: boolean }) {
  const router = useRouter();
  useEffect(() => {
    if (!active) return;
    const t = setInterval(() => router.refresh(), 20_000);
    return () => clearInterval(t);
  }, [active, router]);
  return null;
}
