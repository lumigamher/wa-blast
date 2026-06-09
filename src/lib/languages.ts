export type Language = { code: string; flag: string; nativeName: string };

export const LANGUAGES: Language[] = [
  { code: "es_CO", flag: "🇨🇴", nativeName: "Español (Colombia)" },
  { code: "es_MX", flag: "🇲🇽", nativeName: "Español (México)" },
  { code: "es_ES", flag: "🇪🇸", nativeName: "Español (España)" },
  { code: "en_US", flag: "🇺🇸", nativeName: "English (US)" },
  { code: "pt_BR", flag: "🇧🇷", nativeName: "Português (Brasil)" },
];

export function languageLabel(code: string): string {
  const l = LANGUAGES.find((x) => x.code === code);
  return l ? `${l.flag} ${l.nativeName}` : code;
}
