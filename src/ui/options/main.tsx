/**
 * @fileoverview Options page entry point.
 */
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

import '@/ui/shared/global.css';
import { AppProviders } from '@/ui/shared/AppProviders';
import { OptionsApp } from './OptionsApp';

const container = document.getElementById('root');
if (!container) throw new Error('Missing #root element');

createRoot(container).render(
  <StrictMode>
    <AppProviders>
      <OptionsApp />
    </AppProviders>
  </StrictMode>,
);
