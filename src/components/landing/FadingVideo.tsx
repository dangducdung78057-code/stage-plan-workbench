import { useEffect, useRef } from "react";

const FADE_MS = 500;

type FadingVideoProps = {
  src: string;
  className?: string;
  style?: React.CSSProperties;
};

/**
 * rAF 驱动的视频交叉淡入淡出：
 * - 不使用 CSS transition，不使用 loop 属性（手动循环）
 * - fadeTo 从当前 opacity 续接，每次先 cancelAnimationFrame
 * - timeupdate 距结束 <= 0.55s 时淡出；ended 后 100ms 重置并淡入
 */
export function FadingVideo({ src, className, style }: FadingVideoProps) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const rafRef = useRef<number | null>(null);
  const fadingOutRef = useRef(false);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    const fadeTo = (target: number, duration: number) => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
      const from = parseFloat(video.style.opacity || "0");
      const start = performance.now();
      const step = (now: number) => {
        const t = Math.min((now - start) / duration, 1);
        video.style.opacity = String(from + (target - from) * t);
        if (t < 1) {
          rafRef.current = requestAnimationFrame(step);
        } else {
          rafRef.current = null;
        }
      };
      rafRef.current = requestAnimationFrame(step);
    };

    const onLoadedData = () => {
      video.style.opacity = "0";
      void video.play();
      fadeTo(1, FADE_MS);
    };

    const onTimeUpdate = () => {
      if (fadingOutRef.current) return;
      const remaining = video.duration - video.currentTime;
      if (Number.isFinite(remaining) && remaining <= 0.55 && remaining > 0) {
        fadingOutRef.current = true;
        fadeTo(0, FADE_MS);
      }
    };

    const onEnded = () => {
      video.style.opacity = "0";
      window.setTimeout(() => {
        video.currentTime = 0;
        void video.play();
        fadingOutRef.current = false;
        fadeTo(1, FADE_MS);
      }, 100);
    };

    video.addEventListener("loadeddata", onLoadedData);
    video.addEventListener("timeupdate", onTimeUpdate);
    video.addEventListener("ended", onEnded);
    if (video.readyState >= 2) onLoadedData();

    return () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
      video.removeEventListener("loadeddata", onLoadedData);
      video.removeEventListener("timeupdate", onTimeUpdate);
      video.removeEventListener("ended", onEnded);
    };
  }, [src]);

  return (
    <video
      ref={videoRef}
      src={src}
      autoPlay
      muted
      playsInline
      preload="auto"
      className={className}
      style={{ opacity: 0, ...style }}
      aria-hidden="true"
      tabIndex={-1}
    />
  );
}
