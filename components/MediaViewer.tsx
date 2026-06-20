"use client";

import { useEffect } from "react";
import { X } from "lucide-react";

type MediaViewerProps = {
  url: string;
  type: "image" | "video";
  alt?: string;
  onClose: () => void;
};

export default function MediaViewer({ url, type, alt, onClose }: MediaViewerProps) {
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
      }
    };

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", handleKeyDown);

    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [onClose]);

  return (
    <div
      aria-modal="true"
      className="media-viewer-overlay"
      onClick={onClose}
      role="dialog"
    >
      <button
        aria-label="Close media viewer"
        className="media-viewer-close"
        onClick={onClose}
        type="button"
      >
        <X size={22} aria-hidden="true" />
      </button>

      <div
        className="media-viewer-content"
        onClick={(event) => event.stopPropagation()}
      >
        {type === "image" ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img alt={alt ?? "Shared image"} className="media-viewer-image" src={url} />
        ) : (
          <video
            autoPlay
            className="media-viewer-video"
            controls
            playsInline
            src={url}
          />
        )}
      </div>
    </div>
  );
}
