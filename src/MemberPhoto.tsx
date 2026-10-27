import { usePhoto } from "./shared/usePhoto";
import { useRef, useState } from "react";
import { Camera } from "lucide-react";

export function MemberPhoto({
  initial = "",
  disabled = false,
}: {
  initial?: string;
  disabled?: boolean;
}) {
  const [photo, setPhoto] = useState(initial);
  const photoUrl = usePhoto(photo);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const version = useRef(0);
  async function choose(file?: File) {
    const current = ++version.current;
    setError("");
    if (!file) return;
    if (!["image/jpeg", "image/png"].includes(file.type)) {
      setError("Choose a JPG or PNG image.");
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      setError("This photo could not be processed. Choose another JPG or PNG.");
      return;
    }
    setLoading(true);
    const url = URL.createObjectURL(file);
    try {
      const img = new Image();
      img.src = url;
      await img.decode();
      const canvas = document.createElement("canvas");
      canvas.width = canvas.height = 256;
      const ctx = canvas.getContext("2d");
      if (!ctx) throw Error("Image processing unavailable.");
      ctx.fillStyle = "#fff";
      ctx.fillRect(0, 0, 256, 256);
      const side = Math.min(img.naturalWidth, img.naturalHeight);
      ctx.drawImage(
        img,
        (img.naturalWidth - side) / 2,
        (img.naturalHeight - side) / 2,
        side,
        side,
        0,
        0,
        256,
        256,
      );
      let result = canvas.toDataURL("image/jpeg", 0.8);
      for (const quality of [0.65, 0.5, 0.35]) {
        if (result.length <= 100000) break;
        result = canvas.toDataURL("image/jpeg", quality);
      }
      if (result.length > 100000)
        throw Error("Please choose a simpler or smaller photo.");
      if (current === version.current) setPhoto(result);
    } catch {
      if (current === version.current)
        setError("This image could not be processed. Try another photo.");
    } finally {
      URL.revokeObjectURL(url);
      if (current === version.current) setLoading(false);
      if (input.current) input.current.value = "";
    }
  }
  return (
    <fieldset className="member-photo" disabled={disabled}>
      <legend>
        Profile photo <span className="optional">optional</span>
      </legend>
      <input type="hidden" name="photo" value={photo} />
      <div className="member-photo-row">
        <div className="member-photo-preview">
          {photo ? (
            <img src={photoUrl} alt="Member photo preview" />
          ) : (
            <Camera size={24} aria-label="No photo" />
          )}
        </div>
        <div>
          <input
            ref={input}
            className="photo-file-input"
            aria-label="Upload profile photo"
            type="file"
            accept="image/jpeg,image/png"
            onChange={(e) => void choose(e.target.files?.[0])}
            disabled={loading}
          />
          <div className="photo-buttons">
            <button
              type="button"
              className="small-button"
              disabled={loading}
              onClick={() => input.current?.click()}
            >
              {photo ? "Change photo" : "Upload photo"}
            </button>

            {photo && (
              <button
                type="button"
                className="small-button"
                disabled={loading}
                onClick={() => {
                  ++version.current;
                  setPhoto("");
                  setError("");
                }}
              >
                Remove photo
              </button>
            )}
          </div>
          <small>JPG or PNG</small>
        </div>
      </div>
      {loading && <p role="status">Preparing photo…</p>}
      {loading && (
        <input
          className="photo-processing"
          aria-label="Photo is processing"
          required
          value=""
          onChange={() => {}}
          tabIndex={-1}
        />
      )}
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
    </fieldset>
  );
}
