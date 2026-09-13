import { useId, useMemo } from "react";
import { renderToStaticMarkup } from "react-dom/server.browser";
import NiceAvatar from "react-nice-avatar";
import { getNiceAvatarConfig } from "../lib/avatar";
import { isolateAvatarSvgMarkup } from "../lib/avatarIsolation";
import type { NiceAvatarConfig, ProfileAvatarPreference } from "../lib/avatar";

export interface ProfileAvatarProps {
  name: string;
  dayKey?: string;
  photoURL?: string;
  preference?: ProfileAvatarPreference;
  config?: NiceAvatarConfig;
  size: number;
  className?: string;
  photoFailed?: boolean;
  onPhotoError?: () => void;
}

export function ProfileAvatar({
  name,
  dayKey = "today",
  photoURL,
  preference = "nice",
  config,
  size,
  className = "",
  photoFailed = false,
  onPhotoError,
}: ProfileAvatarProps) {
  const avatarConfig = useMemo(() => {
    if (config) return config;
    const trimmed = name.trim() || "Learner";
    return getNiceAvatarConfig(`${trimmed}:${dayKey}`);
  }, [config, dayKey, name]);

  const imageURL = photoURL?.trim();
  const source = preference === "google" && Boolean(imageURL) && !photoFailed ? "google" : "nice";
  const rawId = useId();
  const instanceId = useMemo(() => rawId.replace(/[^a-zA-Z0-9_-]/g, "") || "avatar", [rawId]);

  const isolatedNiceMarkup = useMemo(() => {
    if (source !== "nice") return "";
    try {
      const rawMarkup = renderToStaticMarkup(
        <NiceAvatar
          id={`nice-avatar-${instanceId}`}
          shape="circle"
          {...avatarConfig}
          style={{ width: "100%", height: "100%" }}
        />
      );
      return isolateAvatarSvgMarkup(rawMarkup, instanceId);
    } catch {
      return "";
    }
  }, [avatarConfig, instanceId, source]);

  return (
    <span
      className={`profile-avatar${className ? ` ${className}` : ""}`}
      style={{
        width: size,
        height: size,
        minWidth: size,
        minHeight: size,
        maxWidth: size,
        maxHeight: size,
      }}
      data-avatar-source={source}
      aria-hidden="true"
    >
      {source === "google" && imageURL ? (
        <img
          className="profile-avatar__img"
          src={imageURL}
          alt=""
          referrerPolicy="no-referrer"
          onError={onPhotoError}
        />
      ) : (
        <span
          className="profile-avatar__markup"
          dangerouslySetInnerHTML={{ __html: isolatedNiceMarkup }}
        />
      )}
    </span>
  );
}
