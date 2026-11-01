const ALPHABET = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
export function encodeBase58(bytes: Uint8Array): string {
  if (!bytes.length) return "";
  let number = 0n;
  for (const byte of bytes) number = number * 256n + BigInt(byte);
  let result = "";
  while (number > 0n) { result = ALPHABET[Number(number % 58n)] + result; number /= 58n; }
  for (const byte of bytes) { if (byte !== 0) break; result = "1" + result; }
  return result;
}
export function decodeBase58(value: string): Uint8Array {
  let number = 0n;
  for (const char of value) { const digit = ALPHABET.indexOf(char); if (digit < 0) throw new Error("Invalid base58 encoding"); number = number * 58n + BigInt(digit); }
  const bytes: number[] = [];
  while (number > 0n) { bytes.unshift(Number(number % 256n)); number /= 256n; }
  for (const char of value) { if (char !== "1") break; bytes.unshift(0); }
  return new Uint8Array(bytes);
}
