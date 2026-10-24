import { useEffect, useState } from "react";
import { resolvePhoto } from "../data/photos";
export function usePhoto(photo = "") {
  const [resolved, setResolved] = useState({ source: "", url: "" });
  useEffect(() => {
    let active = true;
    if (photo.startsWith("storage:member-photos/"))
      void resolvePhoto(photo)
        .then((url) => {
          if (active) setResolved({ source: photo, url });
        })
        .catch(() => {
          if (active) setResolved({ source: photo, url: "" });
        });
    return () => {
      active = false;
    };
  }, [photo]);
  return photo.startsWith("storage:member-photos/")
    ? resolved.source === photo
      ? resolved.url
      : ""
    : photo;
}
