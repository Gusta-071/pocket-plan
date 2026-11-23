import { describe, expect, it } from 'vitest';
import { passwordLevel } from './PasswordStrength';

describe('força da senha', () => {
  it.each([
    ['abcdefg1', 0], // só o mínimo de RN-07: fraca
    ['abc12345', 0], // sequência comum
    ['123456ab', 0], // sequência comum
    ['senha12345', 0], // sequência comum
    ['Abcdefg1', 1], // maiúscula e minúscula
    ['Abcdefg1!', 2], // + símbolo
    ['Abcdefghijk1!', 3], // + 12 caracteres: forte
  ])('%s → nível %i', (password, level) => {
    expect(passwordLevel(password)).toBe(level);
  });
});
