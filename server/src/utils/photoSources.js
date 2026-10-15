'use strict';

/**
 * Free photo libraries for real cover photos. Pixabay is used when its key is
 * set (keys are free and instant), otherwise Pexels (if you already have a key).
 * Only the libraries' own image servers can be downloaded through us.
 */

function parse(value) {
  try {
    const u = new URL(value);
    if (u.protocol !== 'https:' || u.username || u.password || (u.port !== '' && u.port !== '443')) return null;
    return u;
  } catch {
    return null;
  }
}

const isPexelsImageUrl = (v) => parse(v)?.hostname === 'images.pexels.com';
const isPixabayImageUrl = (v) => {
  const u = parse(v);
  return Boolean(u && (u.hostname === 'cdn.pixabay.com' || (u.hostname === 'pixabay.com' && u.pathname.startsWith('/get/'))));
};
const isAllowedImageUrl = (v) => isPexelsImageUrl(v) || isPixabayImageUrl(v);
const safeLink = (v, prefix, fallback) => (typeof v === 'string' && v.startsWith(prefix) ? v : fallback);

function fromPexels(p) {
  if (!p || !p.src || !isPexelsImageUrl(p.src.medium) || !isPexelsImageUrl(p.src.large2x)) return null;
  return {
    id: p.id,
    thumb: p.src.medium,
    full: p.src.large2x,
    alt: String(p.alt || '').slice(0, 140),
    color: /^#[0-9a-f]{6}$/i.test(p.avg_color || '') ? p.avg_color : '#d0d4dc',
    photographer: String(p.photographer || '').slice(0, 80),
    photographerUrl: safeLink(p.photographer_url, 'https://www.pexels.com/', 'https://www.pexels.com'),
    pageUrl: safeLink(p.url, 'https://www.pexels.com/', 'https://www.pexels.com'),
  };
}

function fromPixabay(h) {
  if (!h || !isPixabayImageUrl(h.webformatURL) || !isPixabayImageUrl(h.largeImageURL)) return null;
  const user = String(h.user || '').slice(0, 80);
  return {
    id: h.id,
    thumb: h.webformatURL,
    full: h.largeImageURL,
    alt: String(h.tags || '').slice(0, 140),
    color: '#d0d4dc',
    photographer: user,
    photographerUrl: user && h.user_id ? `https://pixabay.com/users/${encodeURIComponent(user)}-${Number(h.user_id) || 0}/` : 'https://pixabay.com',
    pageUrl: safeLink(h.pageURL, 'https://pixabay.com/', 'https://pixabay.com'),
  };
}

/** Builds the search request for whichever library has a key. */
function searchRequest(provider, key, q, page) {
  if (provider === 'pixabay') {
    const params = new URLSearchParams({ key, q, page: String(page), per_page: '16', image_type: 'photo', orientation: 'horizontal', safesearch: 'true', min_width: '1000' });
    return { url: `https://pixabay.com/api/?${params}`, headers: {} };
  }
  const params = new URLSearchParams({ query: q, page: String(page), per_page: '16', orientation: 'landscape' });
  return { url: `https://api.pexels.com/v1/search?${params}`, headers: { Authorization: key } };
}

function readResults(provider, data, page) {
  if (provider === 'pixabay') {
    const hits = Array.isArray(data.hits) ? data.hits : [];
    return { photos: hits.map(fromPixabay).filter(Boolean), hasMore: page * 16 < Math.min(Number(data.totalHits) || 0, 500) };
  }
  return { photos: (data.photos || []).map(fromPexels).filter(Boolean), hasMore: Boolean(data.next_page) };
}

module.exports = { isPexelsImageUrl, isPixabayImageUrl, isAllowedImageUrl, fromPexels, fromPixabay, searchRequest, readResults, toPhoto: fromPexels };
