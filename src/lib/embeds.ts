export type EmbedProvider =
  | "youtube"
  | "vimeo"
  | "reddit"
  | "facebook"
  | "x"
  | "instagram"
  | "tiktok"
  | "spotify";

export type Embed = {
  provider: EmbedProvider;
  label: string;
  src: string;
  originalUrl: string;
  title: string;
  /** video = 16:9 iframe, post = fixed-height post card, compact = short player */
  aspect: "video" | "post" | "compact";
  height?: number;
  allow?: string;
  allowFullScreen?: boolean;
};

const VIDEO_ALLOW =
  "accelerometer; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share";

function normaliseHost(hostname: string): string {
  return hostname.toLowerCase().replace(/^(www|m|mobile|old)\./, "");
}

function youtubeId(url: URL): string | null {
  const host = normaliseHost(url.hostname);
  let id: string | null = null;

  if (host === "youtu.be") {
    id = url.pathname.split("/").filter(Boolean)[0] ?? null;
  } else if (
    host === "youtube.com" ||
    host === "youtube-nocookie.com" ||
    host === "music.youtube.com"
  ) {
    if (url.pathname === "/watch") {
      id = url.searchParams.get("v");
    } else {
      const parts = url.pathname.split("/").filter(Boolean);
      if (["shorts", "embed", "live", "v"].includes(parts[0] ?? "")) {
        id = parts[1] ?? null;
      }
    }
  }

  return id && /^[A-Za-z0-9_-]{6,64}$/.test(id) ? id : null;
}

/**
 * Resolves a user-supplied URL into a whitelisted embed. Only known providers
 * are accepted, and each iframe URL is rebuilt from a validated ID rather than
 * taken from the raw input.
 */
export function resolveEmbed(rawUrl: string): Embed | null {
  let url: URL;

  try {
    url = new URL(rawUrl);
  } catch {
    return null;
  }

  if (url.protocol !== "http:" && url.protocol !== "https:") {
    return null;
  }

  const host = normaliseHost(url.hostname);
  const originalUrl = url.toString();

  const videoId = youtubeId(url);

  if (videoId) {
    return {
      provider: "youtube",
      label: "YouTube",
      src: `https://www.youtube-nocookie.com/embed/${videoId}?rel=0&autoplay=0`,
      originalUrl,
      title: "YouTube video",
      aspect: "video",
      allow: VIDEO_ALLOW,
      allowFullScreen: true,
    };
  }

  if (host === "vimeo.com" || host === "player.vimeo.com") {
    const parts = url.pathname.split("/").filter(Boolean);
    const id = host === "player.vimeo.com" ? parts[1] : parts[0];

    if (id && /^\d+$/.test(id)) {
      return {
        provider: "vimeo",
        label: "Vimeo",
        src: `https://player.vimeo.com/video/${id}?autoplay=0`,
        originalUrl,
        title: "Vimeo video",
        aspect: "video",
        allow: VIDEO_ALLOW,
        allowFullScreen: true,
      };
    }
  }

  if (
    host === "reddit.com" ||
    host === "redditmedia.com" ||
    host === "embed.reddit.com"
  ) {
    const path = url.pathname.replace(/\/+$/, "");

    if (/^\/(r|user)\/[^/]+\/comments\/[^/]+/.test(path)) {
      return {
        provider: "reddit",
        label: "Reddit",
        src: `https://www.redditmedia.com${path}/?depth=1&showmore=false&embed=true&context=1&showmedia=false`,
        originalUrl,
        title: "Reddit post",
        aspect: "post",
        height: 560,
      };
    }
  }

  if (host === "facebook.com" || host === "fb.watch" || host === "fb.com") {
    const path = url.pathname;
    const isPost =
      host === "fb.watch" ||
      /\/(posts|videos|reel|watch|photo|permalink)\b/.test(path) ||
      url.searchParams.has("v") ||
      url.searchParams.has("story_fbid");

    if (isPost) {
      const isVideo =
        host === "fb.watch" ||
        /\/(videos|reel|watch)\b/.test(path) ||
        url.searchParams.has("v");
      const href = encodeURIComponent(originalUrl);

      return {
        provider: "facebook",
        label: "Facebook",
        src: isVideo
          ? `https://www.facebook.com/plugins/video.php?href=${href}&show_text=false&width=500`
          : `https://www.facebook.com/plugins/post.php?href=${href}&show_text=true&width=500`,
        originalUrl,
        title: isVideo ? "Facebook video" : "Facebook post",
        aspect: "post",
        height: 600,
        allowFullScreen: isVideo,
      };
    }
  }

  if (host === "twitter.com" || host === "x.com") {
    const match = url.pathname.match(/\/status\/(\d+)/);

    if (match) {
      return {
        provider: "x",
        label: "X",
        src: `https://platform.twitter.com/embed/Tweet.html?id=${match[1]}&dnt=true`,
        originalUrl,
        title: "Post on X",
        aspect: "post",
        height: 520,
      };
    }
  }

  if (host === "instagram.com") {
    const match = url.pathname.match(/^\/(p|reel|tv)\/([A-Za-z0-9_-]+)/);

    if (match) {
      return {
        provider: "instagram",
        label: "Instagram",
        src: `https://www.instagram.com/${match[1]}/${match[2]}/embed/`,
        originalUrl,
        title: "Instagram post",
        aspect: "post",
        height: 680,
      };
    }
  }

  if (host === "tiktok.com") {
    const match = url.pathname.match(/\/video\/(\d+)/);

    if (match) {
      return {
        provider: "tiktok",
        label: "TikTok",
        src: `https://www.tiktok.com/embed/v2/${match[1]}`,
        originalUrl,
        title: "TikTok video",
        aspect: "post",
        height: 720,
        allowFullScreen: true,
      };
    }
  }

  if (host === "spotify.com" || host === "open.spotify.com") {
    const match = url.pathname.match(
      /^\/(track|album|playlist|episode|show|artist)\/([A-Za-z0-9]+)/,
    );

    if (match) {
      return {
        provider: "spotify",
        label: "Spotify",
        src: `https://open.spotify.com/embed/${match[1]}/${match[2]}`,
        originalUrl,
        title: "Spotify player",
        aspect: "compact",
        height: match[1] === "track" ? 152 : 352,
      };
    }
  }

  return null;
}
