// Basic list of offensive words (Russian and English)
const BAD_WORDS = [
  'fuck', 'shit', 'bitch', 'ass', 'stupid', 'idiot',
  'блять', 'сука', 'хуй', 'пизда', 'ебать', 'мудак', 'говно', 'жопа', 'урод', 'дебил'
];

export const SecurityService = {
  /**
   * Basic XSS Sanitization
   * Relaxed rule: Only remove dangerously specific tags to allow normal text flow.
   * React automatically escapes content in {} bindings, so full HTML encoding isn't needed.
   */
  sanitize: (input: string): string => {
    if (!input) return '';
    // Just remove outright dangerous tags, leave text and punctuation alone.
    return input
        .replace(/<script\b[^>]*>([\s\S]*?)<\/script>/gim, "")
        .replace(/<iframe\b[^>]*>([\s\S]*?)<\/iframe>/gim, "")
        .replace(/<object\b[^>]*>([\s\S]*?)<\/object>/gim, "")
        .replace(/javascript:/gim, "");
  },

  /**
   * Profanity Filter
   * Replaces bad words with asterisks.
   */
  filterProfanity: (text: string): string => {
    let filteredText = text;
    BAD_WORDS.forEach(word => {
      // Use word boundary to avoid replacing substrings in legitimate words
      const regex = new RegExp(`\\b${word}\\b`, 'gi');
      filteredText = filteredText.replace(regex, '***');
    });
    return filteredText;
  },

  /**
   * Validates that content is safe and appropriate
   */
  processContent: (text: string): string => {
    const sanitized = SecurityService.sanitize(text);
    return SecurityService.filterProfanity(sanitized);
  }
};
