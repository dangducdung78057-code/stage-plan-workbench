import { useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";

type BlurTextProps = {
  text: string;
  className?: string;
  justify?: "center" | "flex-start";
};

/**
 * 逐词模糊入场：IntersectionObserver 10% 可见时触发，
 * 每个词 blur(10px)/y50 → blur(5px)/y-5 → blur(0)/y0 三段关键帧，词间 100ms 交错。
 */
export function BlurText({ text, className, justify = "center" }: BlurTextProps) {
  const ref = useRef<HTMLParagraphElement | null>(null);
  const [inView, setInView] = useState(false);
  const words = text.split(" ");

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setInView(true);
          observer.disconnect();
        }
      },
      { threshold: 0.1 },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return (
    <p
      ref={ref}
      className={className}
      style={{ display: "flex", flexWrap: "wrap", justifyContent: justify, rowGap: "0.1em" }}
    >
      {words.map((word, i) => (
        <motion.span
          key={`${word}-${i}`}
          initial={{ filter: "blur(10px)", opacity: 0, y: 50 }}
          animate={
            inView
              ? {
                  filter: ["blur(10px)", "blur(5px)", "blur(0px)"],
                  opacity: [0, 0.5, 1],
                  y: [50, -5, 0],
                }
              : undefined
          }
          transition={{ duration: 0.7, times: [0, 0.5, 1], ease: "easeOut", delay: (i * 100) / 1000 }}
          style={{ display: "inline-block", marginRight: "0.28em" }}
        >
          {word}
        </motion.span>
      ))}
    </p>
  );
}
