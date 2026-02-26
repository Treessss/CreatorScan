import { COUNTRY_OPTIONS_ZH } from '../constants/countryOptions';

describe('COUNTRY_OPTIONS_ZH', () => {
  it('does not contain duplicate Chinese labels', () => {
    const labels = COUNTRY_OPTIONS_ZH.map((item) => item.label);
    const unique = new Set(labels);
    expect(unique.size).toBe(labels.length);
  });

  it('merges alias codes into one option (UK/GB, VN/VD)', () => {
    const uk = COUNTRY_OPTIONS_ZH.find((item) => item.label === '英国');
    const vn = COUNTRY_OPTIONS_ZH.find((item) => item.label === '越南');

    expect(uk).toBeTruthy();
    expect(uk!.value).toContain('GB');
    expect(uk!.value).toContain('UK');

    expect(vn).toBeTruthy();
    expect(vn!.value).toContain('VN');
    expect(vn!.value).toContain('VD');
  });
});

