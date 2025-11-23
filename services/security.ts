
// Basic list of offensive words (Russian and English)
const BAD_WORDS = [
  'fuck', 'shit', 'bitch', 'ass', 'stupid', 'idiot',
  'блять', 'сука', 'хуй', 'пизда', 'ебать', 'мудак', 'говно', 'жопа', 'урод', 'дебил'
];

export const SecurityService = {
  /**
   * Basic XSS Sanitization
   * Prevents script injection by escaping HTML characters.
   */
  sanitize: (input: string): string => {
    const map: Record<string, string> = {
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#x27;',
      "/": '&#x2F;',
    };
    const reg = /[&<>"'/]/ig;
    return input.replace(reg, (match) => (map[match]));
  },

  /**
   * Profanity Filter
   * Replaces bad words with asterisks.
   */
  filterProfanity: (text: string): string => {
    let filteredText = text;
    BAD_WORDS.forEach(word => {
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
