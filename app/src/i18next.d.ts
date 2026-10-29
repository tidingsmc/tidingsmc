// Makes t() check its keys and their {{placeholders}} against the English texts.

import 'i18next';
import type en from './locales/en.json';

declare module 'i18next' {
  interface CustomTypeOptions {
    resources: { translation: typeof en };
  }
}
