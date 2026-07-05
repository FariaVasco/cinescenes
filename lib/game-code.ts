// Single source of truth for the invite-code format. The generator, the join-screen
// input filters, and the DB column (supabase/schema.sql: game_code char(6)) must agree.

export const GAME_CODE_LENGTH = 6;

export const GAME_CODE_PLACEHOLDER = 'ABCDEF';

// Letters only — easy to read aloud and type on a phone keyboard.
const GAME_CODE_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';

export function generateGameCode(): string {
  let code = '';
  for (let i = 0; i < GAME_CODE_LENGTH; i++) {
    code += GAME_CODE_ALPHABET[Math.floor(Math.random() * GAME_CODE_ALPHABET.length)];
  }
  return code;
}

// Digits stay typeable even though the generator no longer emits them: codes created
// by older builds (base36) contain digits and must remain joinable.
export function sanitizeGameCodeInput(text: string): string {
  return text.replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
}
