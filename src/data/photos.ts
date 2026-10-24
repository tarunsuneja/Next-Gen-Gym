import { BoundedCache } from "../shared/BoundedCache";
import type { Data } from "../domain";
import type { Action } from "./commands";
import { supabase } from "./client";
const prefix = "storage:member-photos/";
const cache = new BoundedCache<string, Promise<string>>(256, 50 * 60000);
export function clearPhotoCache() {
  cache.clear();
}
export async function resolvePhoto(photo: string): Promise<string> {
  if (!photo.startsWith(prefix)) return photo;
  if (!supabase) return "";
  const found = cache.get(photo);
  if (found) return found;
  const url = supabase.storage
    .from("member-photos")
    .createSignedUrl(photo.slice(prefix.length), 3600)
    .then(({ data, error }) => {
      if (error) throw error;
      return data.signedUrl;
    });
  cache.set(photo, url);
  try {
    return await url;
  } catch (error) {
    if (cache.get(photo) === url) cache.delete(photo);
    throw error;
  }
}
export async function prepareMemberPhoto(
  action: Action,
  workspace?: Data,
): Promise<Action> {
  if (
    action.type !== "member" ||
    !action.payload.photo?.startsWith("data:image/jpeg;base64,") ||
    !workspace?.capabilities?.photoStorage
  )
    return action;
  if (!supabase) throw Error("Supabase is not configured.");
  const { data: gym, error } = await supabase.rpc("my_gym");
  if (error) throw error;
  if (typeof gym !== "string") throw Error("No active gym access.");
  const bytes = Uint8Array.from(atob(action.payload.photo.split(",")[1]), (c) =>
    c.charCodeAt(0),
  );
  // Content-addressed objects keep retries deterministic and avoid duplicate uploads.
  let hash: string;
  if (crypto.subtle) {
    const digest = await crypto.subtle.digest("SHA-256", bytes);
    hash = Array.from(new Uint8Array(digest), (b) =>
      b.toString(16).padStart(2, "0"),
    ).join("");
  } else {
    const result = await supabase.rpc("photo_object_key", {
      p_photo: action.payload.photo,
    });
    if (result.error) throw result.error;
    hash = String(result.data);
  }

  const path = `${gym}/${hash}.jpg`;
  const uploaded = await supabase.storage
    .from("member-photos")
    .upload(path, bytes, {
      contentType: "image/jpeg",
      upsert: true,
      cacheControl: "3600",
    });
  if (uploaded.error) throw uploaded.error;
  return { ...action, payload: { ...action.payload, photo: prefix + path } };
}
