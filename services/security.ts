// Basic list of offensive words (Russian and English)
const BAD_WORDS = [
  'fuck', 'shit', 'bitch', 'ass', 'stupid', 'idiot',
  'блять', 'сука', 'хуй', 'пизда', 'ебать', 'мудак', 'говно', 'жопа', 'урод', 'дебил'
];

export const SecurityService = {
  /**
   * Basic XSS Sanitization
   * Only escape critical HTML tags. React handles most text escaping automatically.
   * We do NOT want to escape / or ' or " excessively as it breaks readability.
   */
  sanitize: (input: string): string => {
    if (!input) return '';
    // Only escape < and > to prevent injection of script tags or HTML structure
    return input
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;");
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
