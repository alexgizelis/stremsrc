import * as cheerio from "cheerio";
import { fetchAndParseHLS } from "./hls-utils";

const SOURCE_URL = "https://vidsrc-embed.ru/embed";

interface Server {
  name: string;
  dataHash: string | null;
}

interface StreamResult {
  name: string;
  image: string;
  mediaId: string;
  stream: string;
  referer: string;
  hlsData: any;
}

let BASEDOM = "https://cloudnestra.com";

// Rotate through realistic user agents
const USER_AGENTS = [
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/128.0.0.0 Safari/537.36",
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) Chrome/128.0.0.0 Safari/537.36",
  "Mozilla/5.0 (Windows NT 10.0; Win64; rv:129.0) Firefox/129.0",
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) Safari/605.1.15",
];

function getRandomUserAgent(): string {
  return USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)];
}

function getRandomizedHeaders(): Record<string, string> {
  const userAgent = getRandomUserAgent();
  return {
    "User-Agent": userAgent,
    "Accept": "*/*",
    "Accept-Language": "en-US,en;q=0.9",
    "Referer": `${BASEDOM}/`,
  };
}

async function serversLoad(html: string): Promise<{ servers: Server[]; title: string }> {
  const $ = cheerio.load(html);
  const servers: Server[] = [];

  const title = $("title").text() || "";
  const base = $("iframe").attr("src") || "";
  if (base) {
    BASEDOM = new URL(base.startsWith("//") ? "https:" + base : base).origin;
  }

  $(".serversList .server").each((_, el) => {
    const server = $(el);
    servers.push({
      name: server.text().trim(),
      dataHash: server.attr("data-hash") ?? null,
    });
  });

  return { servers, title };
}

async function PRORCPhandler(prorcp: string): Promise<string | null> {
  try {
    const res = await fetch(`${BASEDOM}/prorcp/${prorcp}`, {
      headers: getRandomizedHeaders(),
    });
    if (!res.ok) return null;

    const text = await res.text();
    const match = /file:\s*'([^']*)'/.exec(text);
    return match?.[1] ?? null;
  } catch {
    return null;
  }
}

async function rcpGrabber(html: string): Promise<{ data: string; metadata: { image: string } } | null> {
  const match = html.match(/src:\s*'([^']*)'/);
  if (!match) return null;

  return {
    data: match[1],
    metadata: { image: "" },
  };
}

function getUrl(id: string, type: "movie" | "series"): string {
  if (type === "movie") {
    return `${SOURCE_URL}/movie/${id}`;
  }
  const [showId, season, episode] = id.split(":");
  return `${SOURCE_URL}/tv/${showId}/${season}-${episode}`;
}

export async function getStreamContent(id: string, type: "movie" | "series"): Promise<StreamResult[]> {
  const url = getUrl(id, type);
  const embed = await fetch(url, { headers: getRandomizedHeaders() });
  const embedResp = await embed.text();

  const { servers, title } = await serversLoad(embedResp);

  const rcpResponses = await Promise.all(
    servers.map(s =>
      fetch(`${BASEDOM}/rcp/${s.dataHash}`, { headers: getRandomizedHeaders() })
    )
  );

  const prosrcrcp = await Promise.all(
    rcpResponses.map(async r => rcpGrabber(await r.text()))
  );

  const apiResponse: StreamResult[] = [];

  for (const item of prosrcrcp) {
    if (!item) continue;

    if (item.data.startsWith("/prorcp/")) {
      const streamUrl = await PRORCPhandler(item.data.replace("/prorcp/", ""));
      if (streamUrl) {
        const hlsData = await fetchAndParseHLS(streamUrl);
        apiResponse.push({
          name: title,
          image: item.metadata.image,
          mediaId: id,
          stream: streamUrl,
          referer: BASEDOM,
          hlsData,
        });
      }
    }
  }

  return apiResponse;
}
