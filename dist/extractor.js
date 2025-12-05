"use strict";
/*
 Lightweight VidSRC.to extractor (Option A)
 - Attempts to extract HLS streams (master + qualities) from vidsrc.to embed pages
 - Simple/resilient: looks for `sources` arrays, iframes, direct .m3u8 URLs,
   and basic /proxy/{server}/{id} endpoints that return .m3u8.
 - Does NOT attempt to fully unpack heavy obfuscation/packed evals.
*/

var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
  if (k2 === undefined) k2 = k;
  var desc = Object.getOwnPropertyDescriptor(m, k);
  if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
    desc = { enumerable: true, get: function() { return m[k]; } };
  }
  Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
  if (k2 === undefined) k2 = k;
  o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
  Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
  o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
  var ownKeys = function(o) {
    ownKeys = Object.getOwnPropertyNames || function (o) {
      var ar = [];
      for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
      return ar;
    };
    return ownKeys(o);
  };
  return function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
    __setModuleDefault(result, mod);
    return result;
  };
})();
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
  function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
  return new (P || (P = Promise))(function (resolve, reject) {
    function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
    function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
    function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
    step((generator = generator.apply(thisArg, _arguments || [])).next());
  });
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getUrl = getUrl;
exports.getStreamContent = getStreamContent;

const cheerio = __importStar(require("cheerio"));
const hls_utils_1 = require("./hls-utils"); // must exist in your project (fetchAndParseHLS)

// default vidsrc embed host
let BASEDOM = "https://cloudnestra.com";
const SOURCE_URL = "https://vidsrc.to/embed";

// --- simple UA rotation (same idea as your original) ---
const USER_AGENTS = [
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36",
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36",
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:129.0) Gecko/20100101 Firefox/129.0",
  "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36",
];
function getRandomUserAgent() {
  return USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)];
}
function getRandomizedHeaders() {
  const ua = getRandomUserAgent();
  return {
    "accept": "*/*",
    "accept-language": "en-US,en;q=0.9",
    "referer": `${BASEDOM}/`,
    "user-agent": ua,
  };
}

// --- helpers to pull URLs out of arbitrary JS/html ---
function findFirstM3U8(text) {
  if (!text)
    return null;
  // common patterns: "https://.../master.m3u8", 'https://.../playlist.m3u8'
  const m = text.match(/https?:\/\/[^\s"'\\]+\.m3u8[^\s"'\\]*/i);
  return m ? m[0] : null;
}
function tryParseSourcesArray(htmlText) {
  // Try to extract a "sources" array embedded in JS:
  // e.g. sources: [{file: "https://...m3u8", label:"720p"}, ...]
  const sourcesRegex = /sources\s*:\s*(\[[^\]]+\])/i;
  const match = sourcesRegex.exec(htmlText);
  if (!match)
    return null;
  try {
    // massage into valid JSON: replace unquoted keys with quoted ones (best-effort)
    let srcStr = match[1];
    // replace single quotes -> double
    srcStr = srcStr.replace(/(\')/g, '"');
    // try parse
    const parsed = JSON.parse(srcStr);
    if (Array.isArray(parsed))
      return parsed;
    return null;
  }
  catch (e) {
    return null;
  }
}

function getObject(id) {
  const arr = id.split(':');
  return {
    id: arr[0],
    season: arr[1],
    episode: arr[2]
  };
}
function getUrl(id, type) {
  // id expected to be e.g. "tt0120737" or "12345:1:2" for series
  if (type === "movie") {
    return `${SOURCE_URL}/movie/${id}`;
  }
  else {
    const obj = getObject(id);
    return `${SOURCE_URL}/tv/${obj.id}/${obj.season}-${obj.episode}`;
  }
}

/**
 * Lightweight resolver for common vidsrc proxy endpoints.
 * It tries:
 *  - /proxy/{server}/{id}  (vidsrc proxy path)
 *  - If the response contains an m3u8 URL, return it.
 */
function tryResolveProxy(server, id) {
  return __awaiter(this, void 0, void 0, function* () {
    try {
      // Most VidSRC proxies live under BASEDOM/proxy/{server}/{id}
      const proxyUrl = `${BASEDOM}/proxy/${server}/${id}`;
      const resp = yield fetch(proxyUrl, { headers: getRandomizedHeaders() });
      if (!resp.ok) return null;
      const txt = yield resp.text();
      // Look for direct m3u8
      const m3u8 = findFirstM3U8(txt);
      if (m3u8) return m3u8;
      // Some proxies return an iframe src or JSON with 'file' key
      const fileMatch = txt.match(/file\s*[:=]\s*["']([^"']+)["']/i);
      if (fileMatch) return fileMatch[1];
      const srcMatch = txt.match(/src\s*[:=]\s*["']([^"']+)["']/i);
      if (srcMatch) return srcMatch[1];
      return null;
    }
    catch (e) {
      return null;
    }
  });
}

/**
 * Main function: fetch embed page, extract candidate stream urls, then use fetchAndParseHLS
 * to return structured hlsData where possible.
 */
function getStreamContent(id, type) {
  return __awaiter(this, void 0, void 0, function* () {
    const url = getUrl(id, type);
    // fetch embed page
    const embedResp = yield fetch(url, { headers: getRandomizedHeaders() });
    if (!embedResp.ok) return [];
    const embedText = yield embedResp.text();

    // update BASEDOM if iframe origin points elsewhere
    try {
      const $ = cheerio.load(embedText);
      const iframeSrc = $("iframe").attr("src") || "";
      if (iframeSrc) {
        try {
          const resolved = new URL(iframeSrc.startsWith("//") ? "https:" + iframeSrc : iframeSrc);
          BASEDOM = resolved.origin;
        }
        catch (e) { /* ignore */ }
      }
    }
    catch (e) { /* ignore */ }

    // Title best-effort
    let title = "";
    try {
      const $ = cheerio.load(embedText);
      title = $("title").text() || title;
    } catch (e) { /* ignore */ }

    const streams = [];

    // 1) Try to parse a JS sources array (very common)
    const parsedSources = tryParseSourcesArray(embedText);
    if (parsedSources && parsedSources.length > 0) {
      for (const s of parsedSources) {
        // s might be an object like {file: "...", label: "720p"} or {file: "..."}
        const fileUrl = s.file || s.src || s.file_url || s.url || null;
        if (!fileUrl) continue;
        // if it's an m3u8, parse qualities
        if (fileUrl.includes(".m3u8")) {
          const hlsData = yield (0, hls_utils_1.fetchAndParseHLS)(fileUrl);
          if (hlsData && hlsData.qualities && hlsData.qualities.length > 0) {
            // master / auto
            streams.push({
              title: `${title} - VidSRC Auto`,
              url: fileUrl,
              behaviorHints: { proxyHeaders: { request: { Referer: BASEDOM } }, notWebReady: true }
            });
            for (const q of hlsData.qualities) {
              streams.push({
                title: `${title} - VidSRC ${q.title}`,
                url: q.url,
                behaviorHints: { proxyHeaders: { request: { Referer: BASEDOM } }, notWebReady: true }
              });
            }
            continue;
          }
          // fallback: push raw
          streams.push({
            title: `${title} - VidSRC`,
            url: fileUrl,
            behaviorHints: { proxyHeaders: { request: { Referer: BASEDOM } }, notWebReady: true }
          });
        } else {
          // not an m3u8 (maybe direct mp4 or an obfuscated link) - push as-is
          streams.push({
            title: `${title} - VidSRC`,
            url: fileUrl,
            behaviorHints: { proxyHeaders: { request: { Referer: BASEDOM } }, notWebReady: true }
          });
        }
      }
      // return early if we found sources
      if (streams.length > 0) return streams;
    }

    // 2) Look for direct m3u8 in page text
    const directM3U8 = findFirstM3U8(embedText);
    if (directM3U8) {
      const hlsData = yield (0, hls_utils_1.fetchAndParseHLS)(directM3U8);
      if (hlsData && hlsData.qualities && hlsData.qualities.length > 0) {
        streams.push({
          title: `${title} - VidSRC Auto`,
          url: directM3U8,
          behaviorHints: { proxyHeaders: { request: { Referer: BASEDOM } }, notWebReady: true }
        });
        for (const q of hlsData.qualities) {
          streams.push({
            title: `${title} - VidSRC ${q.title}`,
            url: q.url,
            behaviorHints: { proxyHeaders: { request: { Referer: BASEDOM } }, notWebReady: true }
          });
        }
      } else {
        streams.push({
          title: `${title} - VidSRC`,
          url: directM3U8,
          behaviorHints: { proxyHeaders: { request: { Referer: BASEDOM } }, notWebReady: true }
        });
      }
      return streams;
    }

    // 3) Look for server/id patterns embedded in JS (simple heuristics).
    // e.g. {server: "filemoon", id: "abc123"} or ["filemoon","abc123"]
    const serverIdRegex = /server\s*[:=]\s*['"]?([a-z0-9_\-]+)['"]?\s*[,;\}]?\s*id\s*[:=]\s*['"]?([a-zA-Z0-9_\-]+)['"]?/ig;
    let match;
    const tried = new Set();
    while ((match = serverIdRegex.exec(embedText)) !== null) {
      const server = match[1];
      const sid = match[2];
      if (!server || !sid) continue;
      const key = `${server}:${sid}`;
      if (tried.has(key)) continue;
      tried.add(key);
      const resolved = yield tryResolveProxy(server, sid);
      if (resolved) {
        // resolved may be an m3u8 or mp4
        if (resolved.includes(".m3u8")) {
          const hlsData = yield (0, hls_utils_1.fetchAndParseHLS)(resolved);
          if (hlsData && hlsData.qualities && hlsData.qualities.length > 0) {
            streams.push({
              title: `${title} - VidSRC Auto (${server})`,
              url: resolved,
              behaviorHints: { proxyHeaders: { request: { Referer: BASEDOM } }, notWebReady: true }
            });
            for (const q of hlsData.qualities) {
              streams.push({
                title: `${title} - VidSRC ${q.title} (${server})`,
                url: q.url,
                behaviorHints: { proxyHeaders: { request: { Referer: BASEDOM } }, notWebReady: true }
              });
            }
          } else {
            streams.push({
              title: `${title} - VidSRC (${server})`,
              url: resolved,
              behaviorHints: { proxyHeaders: { request: { Referer: BASEDOM } }, notWebReady: true }
            });
          }
        } else {
          streams.push({
            title: `${title} - VidSRC (${server})`,
            url: resolved,
            behaviorHints: { proxyHeaders: { request: { Referer: BASEDOM } }, notWebReady: true }
          });
        }
      }
    }

    // 4) Look for iframe src (some embeds just include an iframe to another host)
    try {
      const $ = cheerio.load(embedText);
      const iframeSrc = $("iframe").attr("src");
      if (iframeSrc) {
        // normalize url
        const resolvedIframe = iframeSrc.startsWith("//") ? "https:" + iframeSrc : iframeSrc;
        // if iframe contains m3u8, handle it
        if (resolvedIframe.includes(".m3u8")) {
          const hlsData = yield (0, hls_utils_1.fetchAndParseHLS)(resolvedIframe);
          if (hlsData && hlsData.qualities && hlsData.qualities.length > 0) {
            streams.push({
              title: `${title} - VidSRC Auto`,
              url: resolvedIframe,
              behaviorHints: { proxyHeaders: { request: { Referer: BASEDOM } }, notWebReady: true }
            });
            for (const q of hlsData.qualities) {
              streams.push({
                title: `${title} - VidSRC ${q.title}`,
                url: q.url,
                behaviorHints: { proxyHeaders: { request: { Referer: BASEDOM } }, notWebReady: true }
              });
            }
          } else {
            streams.push({
              title: `${title} - VidSRC`,
              url: resolvedIframe,
              behaviorHints: { proxyHeaders: { request: { Referer: BASEDOM } }, notWebReady: true }
            });
          }
          return streams;
        }

        // otherwise try to fetch iframe and search for m3u8 inside it
        try {
          const iframeResp = yield fetch(resolvedIframe, { headers: getRandomizedHeaders() });
          if (iframeResp.ok) {
            const iframeText = yield iframeResp.text();
            const iframeM3U8 = findFirstM3U8(iframeText);
            if (iframeM3U8) {
              const hlsData = yield (0, hls_utils_1.fetchAndParseHLS)(iframeM3U8);
              if (hlsData && hlsData.qualities && hlsData.qualities.length > 0) {
                streams.push({
                  title: `${title} - VidSRC Auto`,
                  url: iframeM3U8,
                  behaviorHints: { proxyHeaders: { request: { Referer: BASEDOM } }, notWebReady: true }
                });
                for (const q of hlsData.qualities) {
                  streams.push({
                    title: `${title} - VidSRC ${q.title}`,
                    url: q.url,
                    behaviorHints: { proxyHeaders: { request: { Referer: BASEDOM } }, notWebReady: true }
                  });
                }
                return streams;
              } else {
                streams.push({
                  title: `${title} - VidSRC`,
                  url: iframeM3U8,
                  behaviorHints: { proxyHeaders: { request: { Referer: BASEDOM } }, notWebReady: true }
                });
                return streams;
              }
            }
          }
        } catch (e) { /* ignore iframe fetch errors */ }
      }
    } catch (e) { /* ignore cheerio errors */ }

    // 5) final fallback: attempt to find generic video src (mp4) in page
    const mp4match = embedText.match(/https?:\/\/[^\s"'\\]+\.mp4[^\s"'\\]*/i);
    if (mp4match) {
      streams.push({
        title: `${title} - VidSRC (mp4)`,
        url: mp4match[0],
        behaviorHints: { proxyHeaders: { request: { Referer: BASEDOM } }, notWebReady: true }
      });
    }

    return streams;
  });
}

exports.getUrl = getUrl;
exports.getStreamContent = getStreamContent;
