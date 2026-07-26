import { toSlug } from './slug';

describe('toSlug', () => {
  it('should remove leading and trailing dashes', () => {
    expect(toSlug('💥 Cancellation Attacks and Magic Resistance')).toEqual(
      'cancellation-attacks-and-magic-resistance'
    );
    expect(toSlug('  Hello World  ')).toEqual('hello-world');
    expect(toSlug('---Hello World---')).toEqual('hello-world');
  });
});
