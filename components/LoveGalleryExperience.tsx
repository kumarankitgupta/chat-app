"use client";

import { type CSSProperties, useEffect, useMemo, useState } from "react";

type Props = {
  viewerKey: string;
  onFinish: () => void;
};

const MESSAGE_INTERVAL_MS = 4500;
const CONFETTI_COUNT = 96;
const ORBIT_EMOJI_COUNT = 30;
const ORBIT_EMOJIS = ["💖", "💕", "💘", "💝", "🥰", "🫶", "✨", "🌸", "💞", "💗"];

const TOUCH_MESSAGES = [
  "your hand in mine feels like my forever promise.",
  "I hold your fingers and my whole world calms down.",
  "this touch says everything my heart cannot explain.",
  "in your hand, my worries become tiny and silent.",
  "your warmth reaches my soul before your words do.",
  "this little hand-hold is my favorite kind of home.",
  "your closeness turns ordinary seconds into poetry.",
  "when I hold you, even time stands still for us.",
  "your touch is gentle, but it saves me every day.",
  "my heart smiles the loudest when you hold me close.",
  "this moment is soft, safe, and completely ours.",
  "I never knew peace until your hand found mine.",
  "with you this near, everything feels perfectly right.",
];

const BLOOM_MESSAGES = [
  "you bloom brighter than every flower around you.",
  "the garden looks beautiful, but you are still the view.",
  "flowers frame you, but your smile frames my life.",
  "nature dressed up today just to match your glow.",
  "you stand there and suddenly the world feels kind.",
  "every petal looks like it learned beauty from you.",
  "the colors are lovely, yet your aura shines stronger.",
  "you look like a spring morning my heart waited for.",
  "even the breeze slows down to admire you.",
  "you are the only season my heart believes in.",
  "the whole scene is pretty, but you are magic.",
  "you turned this place into our love story backdrop.",
  "I found my favorite flower, and it is your smile.",
];

const UNIVERSAL_MESSAGES = [
  "I choose you in this life and every life after.",
  "you are my favorite prayer answered gently.",
  "loving you is my most beautiful habit.",
  "you make my heart feel seen and safe.",
  "home is any place where your smile exists.",
  "I keep falling for you in brand new ways.",
  "our love is my calm in every storm.",
  "your presence makes everything softer and brighter.",
  "with you, forever feels too short.",
  "my heart learned its rhythm from your name.",
];

function getPhotoTheme(imagePath: string) {
  const normalized = imagePath.toLowerCase();
  if (normalized.includes("18.52.17")) return "touch";
  if (normalized.includes("18.52.19")) return "bloom";
  return "universal";
}

function getMessagePoolForTheme(theme: "touch" | "bloom" | "universal") {
  if (theme === "touch") return TOUCH_MESSAGES;
  if (theme === "bloom") return BLOOM_MESSAGES;
  return UNIVERSAL_MESSAGES;
}

function createMessageForImage(imagePath: string, index: number) {
  const theme = getPhotoTheme(imagePath);
  const pool = getMessagePoolForTheme(theme);
  const compliment = pool[index % pool.length];
  return compliment;
}

type Stage = "intro" | "gallery" | "final";

export default function LoveGalleryExperience({ viewerKey, onFinish }: Props) {
  const [stage, setStage] = useState<Stage>("intro");
  const [images, setImages] = useState<string[]>([]);
  const [index, setIndex] = useState(0);
  const [confettiBurstId, setConfettiBurstId] = useState(0);

  function getConfettiStyle(confettiIndex: number) {
    const left = (confettiIndex * 13 + 7) % 100;
    const delay = (confettiIndex % 16) * 0.016;
    const duration = 0.85 + (confettiIndex % 7) * 0.11;
    const drift = (confettiIndex % 2 === 0 ? 1 : -1) * (6 + (confettiIndex % 9));
    const rotation = 260 + (confettiIndex % 9) * 52;

    const style: CSSProperties = {
      left: `${left}%`,
      animationDelay: `${delay}s`,
      animationDuration: `${duration}s`,
    };
    (style as CSSProperties & Record<string, string>)["--drift"] = `${drift}px`;
    (style as CSSProperties & Record<string, string>)["--rotation"] =
      `${rotation}deg`;
    return style;
  }

  function getOrbitEmojiStyle(emojiIndex: number) {
    const top = 8 + ((emojiIndex * 11) % 82);
    const left = 4 + ((emojiIndex * 17) % 92);
    const delay = (emojiIndex % 9) * 0.45;
    const duration = 4.2 + (emojiIndex % 7) * 0.55;
    const driftX = (emojiIndex % 2 === 0 ? 1 : -1) * (9 + (emojiIndex % 6) * 2);
    const driftY = 6 + (emojiIndex % 5) * 2;
    const style: CSSProperties = {
      top: `${top}%`,
      left: `${left}%`,
      animationDelay: `${delay}s`,
      animationDuration: `${duration}s`,
    };
    (style as CSSProperties & Record<string, string>)["--orbit-drift-x"] =
      `${driftX}px`;
    (style as CSSProperties & Record<string, string>)["--orbit-drift-y"] =
      `${driftY}px`;
    return style;
  }

  useEffect(() => {
    let isMounted = true;

    async function loadImages() {
      try {
        const response = await fetch("/api/sona-images", { cache: "no-store" });
        if (!response.ok) {
          return;
        }
        const payload = (await response.json()) as { images?: string[] };
        if (isMounted) {
          setImages(payload.images ?? []);
        }
      } catch {
        // Keep graceful fallback if folder does not exist yet.
      }
    }

    void loadImages();
    return () => {
      isMounted = false;
    };
  }, []);

  useEffect(() => {
    if (stage !== "gallery") {
      return;
    }

    if (!images.length) {
      const finalTimer = window.setTimeout(() => {
        setStage("final");
      }, MESSAGE_INTERVAL_MS);
      return () => window.clearTimeout(finalTimer);
    }

    const timer = window.setInterval(() => {
      setIndex((current) => {
        const next = current + 1;
        if (next >= images.length) {
          window.clearInterval(timer);
          setStage("final");
          return current;
        }
        setConfettiBurstId((value) => value + 1);
        return next;
      });
    }, MESSAGE_INTERVAL_MS);

    return () => window.clearInterval(timer);
  }, [images.length, stage]);

  const currentMessage = useMemo(() => {
    if (!images.length) {
      return "Add your photos to public/sona and they will appear here with love.";
    }
    return createMessageForImage(images[index] ?? "", index);
  }, [images.length, index]);

  function finishExperience() {
    window.localStorage.setItem(`love-gallery-seen-${viewerKey}`, "1");
    onFinish();
  }

  if (stage === "intro") {
    return (
      <div className="love-overlay" role="dialog" aria-modal="true">
        <div className="love-aurora" aria-hidden="true" />
        <div className="love-emoji-orbit" aria-hidden="true">
          {Array.from({ length: ORBIT_EMOJI_COUNT }).map((_, orbitIndex) => (
            <span key={orbitIndex} style={getOrbitEmojiStyle(orbitIndex)}>
              {ORBIT_EMOJIS[orbitIndex % ORBIT_EMOJIS.length]}
            </span>
          ))}
        </div>
        <div className="love-spark-field" aria-hidden="true">
          <span>✦</span>
          <span>✧</span>
          <span>✦</span>
          <span>✧</span>
          <span>✦</span>
        </div>
        <div className="love-shell love-intro">
          <div className="love-hearts" aria-hidden="true">
            <span>❤</span>
            <span>❤</span>
            <span>❤</span>
          </div>
          <h2>Something special for u</h2>
          <p>A tiny world made with love, just for your heart.</p>
          <button
            className="love-primary-button pulse-heart"
            onClick={() => setStage("gallery")}
            type="button"
          >
            Am safe to see it
          </button>
        </div>
      </div>
    );
  }

  if (stage === "gallery") {
    return (
      <div className="love-overlay" role="dialog" aria-modal="true">
        <div className="love-aurora" aria-hidden="true" />
        <div className="love-spark-field" aria-hidden="true">
          <span>✦</span>
          <span>✧</span>
          <span>✦</span>
          <span>✧</span>
          <span>✦</span>
          <span>✧</span>
          <span>✦</span>
        </div>
        <div className="love-shell love-gallery">
          <div className="love-slide-counter">
            {images.length ? `${index + 1}/${images.length}` : "0/0"}
          </div>
          <div className="love-side-decor left" aria-hidden="true">
            <span>✨</span>
            <span>💖</span>
            <span>🫶</span>
            <span>🌷</span>
            <span>✨</span>
            <span>💘</span>
          </div>
          <div className="love-side-decor right" aria-hidden="true">
            <span>💫</span>
            <span>💕</span>
            <span>🌸</span>
            <span>🩷</span>
            <span>💫</span>
            <span>🥰</span>
          </div>
          <div
            className="love-confetti"
            key={`confetti-${confettiBurstId}`}
            aria-hidden="true"
          >
            {Array.from({ length: CONFETTI_COUNT }).map((_, confettiIndex) => (
              <span key={confettiIndex} style={getConfettiStyle(confettiIndex)} />
            ))}
          </div>
          <div className="love-image-frame">
            {images.length ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                alt={`Love memory ${index + 1}`}
                className="love-gallery-image"
                key={images[index]}
                src={images[index]}
              />
            ) : (
              <div className="love-gallery-placeholder">
                Preparing your memory wall...
              </div>
            )}
          </div>
          <p className="love-caption" key={`${index}-${currentMessage}`}>
            {currentMessage}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="love-overlay" role="dialog" aria-modal="true">
      <div className="love-aurora" aria-hidden="true" />
      <div className="love-spark-field" aria-hidden="true">
        <span>✦</span>
        <span>✧</span>
        <span>✦</span>
        <span>✧</span>
      </div>
      <div className="love-shell love-final">
        <h2>Love u</h2>
        <p>You are my peace, my joy, and my forever.</p>
        <button
          className="love-primary-button click-me-wiggle"
          onClick={finishExperience}
          type="button"
        >
          Continue to chat
        </button>
      </div>
    </div>
  );
}
