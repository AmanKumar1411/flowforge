import { buildMessage, ValidateBy, ValidationOptions } from "class-validator";

export const IS_CLEAN_TEXT = "isCleanText";

const TAB = 0x09;
const NEWLINE = 0x0a;
const CARRIAGE_RETURN = 0x0d;

/** True unless the value is a string holding a control character (U+0000–U+001F) other than tab, newline or carriage return. */
export function hasNoControlCharacters(value: unknown): boolean {
  if (typeof value !== "string") return true;
  for (let i = 0; i < value.length; i += 1) {
    const code = value.charCodeAt(i);
    if (
      code <= 0x1f &&
      code !== TAB &&
      code !== NEWLINE &&
      code !== CARRIAGE_RETURN
    ) {
      return false;
    }
  }
  return true;
}

/**
 * Free text without control characters: PostgreSQL refuses U+0000 in text, so
 * one used to reach the database and come back as a 500 (BUG-2, H7). Every
 * free-text DTO field carries it; a test checks that none is missing.
 */
export function IsCleanText(options?: ValidationOptions): PropertyDecorator {
  return ValidateBy(
    {
      name: IS_CLEAN_TEXT,
      validator: {
        validate: hasNoControlCharacters,
        defaultMessage: buildMessage(
          (each) =>
            `${each}$property must not contain control characters (tab and new lines are fine)`,
          options,
        ),
      },
    },
    options,
  );
}
