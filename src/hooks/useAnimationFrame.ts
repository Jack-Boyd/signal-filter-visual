// src/hooks/useAnimationFrame.ts
import { useEffect, useRef } from "react";

export function useAnimationFrame(callback: () => void, active: boolean) {
  const callbackRef = useRef(callback);
  callbackRef.current = callback;

  useEffect(() => {
    if (!active) return;
    let id: number;
    const loop = () => {
      callbackRef.current();
      id = requestAnimationFrame(loop);
    };
    id = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(id);
  }, [active]);
}