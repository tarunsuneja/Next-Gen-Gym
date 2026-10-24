import { usePhoto } from "./shared/usePhoto";
import { useState } from "react";

export function MemberAvatar({
  name,
  photo,
  className = "",
}: {
  name: string;
  photo?: string;
  className?: string;
}) {
  const photoUrl = usePhoto(photo);
  const [failedPhoto, setFailedPhoto] = useState<string>();
  const hash = Array.from(name.trim().toLowerCase()).reduce(
    (n, c) => (n * 31 + c.charCodeAt(0)) >>> 0,
    0,
  );
  const hue = hash % 360;
  const initials =
    name
      .trim()
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0])
      .join("")
      .toUpperCase() || "?";
  return (
    <span
      className={`avatar member-avatar ${className}`}
      style={{
        background: `linear-gradient(135deg, hsl(${hue} 55% 40%), hsl(${(hue + 40) % 360} 65% 27%))`,
        color: "#fff",
      }}
    >
      {photoUrl && photoUrl !== failedPhoto ? (
        <img
          src={photoUrl}
          alt=""
          loading="lazy"
          onError={() => setFailedPhoto(photoUrl)}
        />
      ) : (
        initials
      )}
    </span>
  );
}
