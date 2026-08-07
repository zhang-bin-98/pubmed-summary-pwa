export function decodeNumericEntities(value: string): string {
  return value.replace(
    /&#(?:x([\da-f]+)|(\d+));/gi,
    (entity, hexadecimal: string | undefined, decimal: string | undefined) => {
      const codePoint = Number.parseInt(hexadecimal ?? decimal ?? '', hexadecimal ? 16 : 10);
      const isValidXmlCharacter = codePoint === 0x9 || codePoint === 0xa || codePoint === 0xd
        || (codePoint >= 0x20 && codePoint <= 0xd7ff)
        || (codePoint >= 0xe000 && codePoint <= 0xfffd)
        || (codePoint >= 0x10000 && codePoint <= 0x10ffff);
      return Number.isInteger(codePoint) && isValidXmlCharacter
        ? String.fromCodePoint(codePoint)
        : entity;
    },
  );
}
