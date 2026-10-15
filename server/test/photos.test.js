'use strict';
const test = require('node:test');
const assert = require('node:assert');
const S = require('../src/utils/photoSources');

test('only the photo libraries’ image servers can be fetched', () => {
  for (const ok of ['https://images.pexels.com/photos/1/a.jpeg?w=940', 'https://pixabay.com/get/g123_1280.jpg', 'https://cdn.pixabay.com/photo/2020/01/01/a_150.jpg']) assert.ok(S.isAllowedImageUrl(ok), ok);
  for (const bad of ['http://images.pexels.com/x.jpg', 'https://images.pexels.com.evil.com/x.jpg', 'https://pixabay.com/api/?key=x', 'https://pixabay.com.evil.com/get/x', 'https://evil.com/?cdn.pixabay.com', 'https://user@cdn.pixabay.com/x', 'https://cdn.pixabay.com:8080/x', 'file:///etc/passwd', '', 'nonsense'])
    assert.equal(S.isAllowedImageUrl(bad), false, bad);
});

test('Pixabay results become cover photos', () => {
  const r = S.readResults('pixabay', { totalHits: 40, hits: [{ id: 9, tags: 'land, field', user: 'Ola', user_id: 77, pageURL: 'https://pixabay.com/photos/land-9/', webformatURL: 'https://pixabay.com/get/a_640.jpg', largeImageURL: 'https://pixabay.com/get/a_1280.jpg' }, { id: 10, webformatURL: 'https://evil.com/a.jpg', largeImageURL: 'https://pixabay.com/get/b.jpg' }] }, 1);
  assert.equal(r.photos.length, 1);
  assert.equal(r.photos[0].full, 'https://pixabay.com/get/a_1280.jpg');
  assert.equal(r.photos[0].photographerUrl, 'https://pixabay.com/users/Ola-77/');
  assert.equal(r.hasMore, true);
  assert.equal(S.readResults('pixabay', { totalHits: 10, hits: [] }, 1).hasMore, false);
});

test('search requests carry the key the right way', () => {
  const px = S.searchRequest('pixabay', 'K', 'land lagos', 2);
  assert.match(px.url, /^https:\/\/pixabay\.com\/api\/\?key=K&q=land\+lagos&page=2/);
  assert.match(px.url, /safesearch=true/);
  const pe = S.searchRequest('pexels', 'K', 'land', 1);
  assert.equal(pe.headers.Authorization, 'K');
});

test('Pexels photo fields are checked', () => {
  assert.equal(S.fromPexels({ id: 1, photographer_url: 'javascript:alert(1)', src: { medium: 'https://images.pexels.com/a.jpg', large2x: 'https://images.pexels.com/b.jpg' } }).photographerUrl, 'https://www.pexels.com');
});
