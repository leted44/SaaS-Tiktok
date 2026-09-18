import { absoluteUrl } from "@/lib/storage";

export interface PublishPayload {
  videoUrl: string;
  title: string;
  caption: string;
  hashtags: string[];
  privacy: "public" | "private" | "friends";
}

export interface PublishResult {
  externalPostId: string;
  externalUrl: string | null;
}

async function downloadVideo(url: string): Promise<Buffer> {
  const res = await fetch(absoluteUrl(url));
  if (!res.ok) throw new Error(`Impossible de télécharger la vidéo rendue (${res.status})`);
  return Buffer.from(await res.arrayBuffer());
}

function captionWithTags(caption: string, hashtags: string[]) {
  const tags = hashtags.map((h) => `#${h.replace(/^#/, "")}`).join(" ");
  return tags ? `${caption}\n\n${tags}` : caption;
}

/**
 * TikTok Content Posting API — Direct Post with FILE_UPLOAD source.
 * https://developers.tiktok.com/doc/content-posting-api-reference-direct-post
 */
export async function publishToTikTok(accessToken: string, payload: PublishPayload): Promise<PublishResult> {
  const video = await downloadVideo(payload.videoUrl);
  const privacyMap = { public: "PUBLIC_TO_EVERYONE", friends: "MUTUAL_FOLLOW_FRIENDS", private: "SELF_ONLY" } as const;

  const init = await fetch("https://open.tiktokapis.com/v2/post/publish/video/init/", {
    method: "POST",
    headers: { authorization: `Bearer ${accessToken}`, "content-type": "application/json; charset=UTF-8" },
    body: JSON.stringify({
      post_info: {
        title: captionWithTags(payload.caption, payload.hashtags).slice(0, 2200),
        privacy_level: privacyMap[payload.privacy],
        disable_duet: false,
        disable_comment: false,
        disable_stitch: false,
        video_cover_timestamp_ms: 1000,
      },
      source_info: { source: "FILE_UPLOAD", video_size: video.length, chunk_size: video.length, total_chunk_count: 1 },
    }),
  });
  const initData = await init.json();
  if (!init.ok || initData?.error?.code !== "ok") throw new Error(`Échec de l'initialisation TikTok : ${initData?.error?.message ?? init.status}`);

  const { publish_id, upload_url } = initData.data;
  const upload = await fetch(upload_url, {
    method: "PUT",
    headers: { "content-type": "video/mp4", "content-range": `bytes 0-${video.length - 1}/${video.length}`, "content-length": String(video.length) },
    body: new Uint8Array(video),
  });
  if (!upload.ok) throw new Error(`Échec de l'envoi TikTok (${upload.status})`);

  // Poll status until TikTok has processed the upload.
  for (let i = 0; i < 20; i++) {
    await new Promise((r) => setTimeout(r, 3000));
    const status = await fetch("https://open.tiktokapis.com/v2/post/publish/status/fetch/", {
      method: "POST",
      headers: { authorization: `Bearer ${accessToken}`, "content-type": "application/json; charset=UTF-8" },
      body: JSON.stringify({ publish_id }),
    });
    const s = await status.json();
    const st = s?.data?.status;
    if (st === "PUBLISH_COMPLETE") {
      const id = s.data.publicaly_available_post_id?.[0] ?? publish_id;
      return { externalPostId: String(id), externalUrl: null };
    }
    if (st === "FAILED") throw new Error(`Échec de la publication TikTok : ${s.data.fail_reason ?? "inconnu"}`);
  }
  return { externalPostId: publish_id, externalUrl: null };
}

/**
 * YouTube Data API v3 — resumable upload for Shorts.
 * A vertical video < 60s with #Shorts in the title/description is surfaced as a Short.
 */
export async function publishToYouTube(accessToken: string, payload: PublishPayload): Promise<PublishResult> {
  const video = await downloadVideo(payload.videoUrl);
  const description = captionWithTags(payload.caption, [...payload.hashtags, "Shorts"]);
  const privacyMap = { public: "public", friends: "unlisted", private: "private" } as const;

  const init = await fetch("https://www.googleapis.com/upload/youtube/v3/videos?uploadType=resumable&part=snippet,status", {
    method: "POST",
    headers: {
      authorization: `Bearer ${accessToken}`,
      "content-type": "application/json; charset=UTF-8",
      "x-upload-content-length": String(video.length),
      "x-upload-content-type": "video/mp4",
    },
    body: JSON.stringify({
      snippet: { title: payload.title.slice(0, 100), description: description.slice(0, 5000), tags: payload.hashtags.slice(0, 20), categoryId: "22" },
      status: { privacyStatus: privacyMap[payload.privacy], selfDeclaredMadeForKids: false },
    }),
  });
  if (!init.ok) throw new Error(`Échec de l'initialisation YouTube : ${(await init.text()).slice(0, 300)}`);
  const location = init.headers.get("location");
  if (!location) throw new Error("YouTube n'a pas renvoyé d'URL d'envoi");

  const upload = await fetch(location, { method: "PUT", headers: { "content-type": "video/mp4", "content-length": String(video.length) }, body: new Uint8Array(video) });
  const data = await upload.json();
  if (!upload.ok || !data.id) throw new Error(`Échec de l'envoi YouTube : ${data?.error?.message ?? upload.status}`);
  return { externalPostId: data.id, externalUrl: `https://youtube.com/shorts/${data.id}` };
}

/**
 * Instagram Graph API — Reels publishing via media container.
 * Instagram fetches the video from a public URL, so STORAGE_DRIVER must expose files publicly.
 */
export async function publishToInstagram(accessToken: string, igUserId: string, payload: PublishPayload): Promise<PublishResult> {
  const videoUrl = absoluteUrl(payload.videoUrl);
  const create = await fetch(`https://graph.instagram.com/v21.0/${igUserId}/media`, {
    method: "POST",
    body: new URLSearchParams({
      media_type: "REELS",
      video_url: videoUrl,
      caption: captionWithTags(payload.caption, payload.hashtags).slice(0, 2200),
      share_to_feed: "true",
      access_token: accessToken,
    }),
  });
  const container = await create.json();
  if (!create.ok || !container.id) throw new Error(`Échec de la création du conteneur Instagram : ${container?.error?.message ?? create.status}`);

  for (let i = 0; i < 30; i++) {
    await new Promise((r) => setTimeout(r, 4000));
    const st = await fetch(`https://graph.instagram.com/v21.0/${container.id}?fields=status_code,status&access_token=${accessToken}`);
    const s = await st.json();
    if (s.status_code === "FINISHED") break;
    if (s.status_code === "ERROR") throw new Error(`Échec du traitement Instagram : ${s.status ?? "inconnu"}`);
  }

  const publish = await fetch(`https://graph.instagram.com/v21.0/${igUserId}/media_publish`, {
    method: "POST",
    body: new URLSearchParams({ creation_id: container.id, access_token: accessToken }),
  });
  const published = await publish.json();
  if (!publish.ok || !published.id) throw new Error(`Échec de la publication Instagram : ${published?.error?.message ?? publish.status}`);

  const link = await fetch(`https://graph.instagram.com/v21.0/${published.id}?fields=permalink&access_token=${accessToken}`).then((r) => r.json()).catch(() => null);
  return { externalPostId: published.id, externalUrl: link?.permalink ?? null };
}
