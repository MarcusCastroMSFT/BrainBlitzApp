import { useEffect, useRef, useState } from "react";

interface Props {
  duration: number; // seconds
  startTime: number; // unix ms
}

export default function CountdownTimer({ duration, startTime }: Props) {
  const [remaining, setRemaining] = useState(duration);
  const rafRef = useRef<number>(0);

  useEffect(() => {
    const tick = () => {
      const elapsed = (Date.now() - startTime) / 1000;
      const left = Math.max(0, duration - elapsed);
      setRemaining(Math.ceil(left));
      if (left > 0) rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafRef.current);
  }, [duration, startTime]);

  const pct = (remaining / duration) * 100;
  const radius = 28;
  const circumference = 2 * Math.PI * radius;
  const dashoffset = circumference * (1 - pct / 100);

  const color =
    remaining > duration * 0.5
      ? "#a855f7"
      : remaining > duration * 0.25
      ? "#f59e0b"
      : "#ef4444";

  return (
    <div className="relative w-16 h-16 flex items-center justify-center">
      <svg className="absolute inset-0 w-full h-full -rotate-90" viewBox="0 0 64 64">
        <circle cx="32" cy="32" r={radius} fill="none" stroke="white" strokeOpacity={0.1} strokeWidth="5" />
        <circle
          cx="32"
          cy="32"
          r={radius}
          fill="none"
          stroke={color}
          strokeWidth="5"
          strokeDasharray={circumference}
          strokeDashoffset={dashoffset}
          strokeLinecap="round"
          style={{ transition: "stroke-dashoffset 0.5s linear, stroke 0.5s" }}
        />
      </svg>
      <span
        className="text-white font-black text-xl z-10 tabular-nums"
        style={{ color }}
      >
        {remaining}
      </span>
    </div>
  );
}
