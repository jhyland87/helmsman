/**
 * @fileoverview Minimal i18n provider. Dependency-free; structured so more
 * locales drop in by adding a catalog to {@link CATALOGS}.
 */
import { createContext, useContext, useMemo, type ReactNode } from 'react';

import { en, type MessageKey, type Messages } from './en';

const CATALOGS: Readonly<Record<string, Messages>> = {
  en,
};

/** Supported language codes (derived from the registered catalogs). */
export const availableLanguages = Object.keys(CATALOGS);

type Translate = (key: MessageKey) => string;

const I18nContext = createContext<Translate>((key) => en[key]);

export function I18nProvider({
  language,
  children,
}: {
  language: string;
  children: ReactNode;
}): JSX.Element {
  const translate = useMemo<Translate>(() => {
    const catalog = CATALOGS[language] ?? en;
    return (key) => catalog[key] ?? en[key];
  }, [language]);
  return <I18nContext.Provider value={translate}>{children}</I18nContext.Provider>;
}

/** Hook returning the translate function `t(key)`. */
export const useT = (): Translate => useContext(I18nContext);
