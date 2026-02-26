import { toApiAssetUrl } from '../services/api';

describe('toApiAssetUrl', () => {
  it('prefixes backend relative media paths', () => {
    expect(toApiAssetUrl('/media/avatars/1/TikTok/u.png')).toBe('http://localhost:8090/media/avatars/1/TikTok/u.png');
  });

  it('keeps absolute and data urls unchanged', () => {
    expect(toApiAssetUrl('https://cdn.example.com/a.jpg')).toBe('https://cdn.example.com/a.jpg');
    expect(toApiAssetUrl('data:image/png;base64,abc')).toBe('data:image/png;base64,abc');
  });
});
