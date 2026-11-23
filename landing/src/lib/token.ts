/**
 * Token contract address shown in the hero CA slot on the home page.
 * Fill at launch. An empty string (or anything that is not a 0x + 40 hex
 * address) keeps the slot hidden.
 */
export const TOKEN_CA = '';

export const TOKEN_EXPLORER_URL = 'https://robinhoodchain.blockscout.com/token/';

export function isTokenAddress(value: string): boolean {
  return /^0x[0-9a-fA-F]{40}$/.test(value);
}
