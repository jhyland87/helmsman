/**
 * @fileoverview Popup entry point.
 */
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

import '@/ui/shared/global.css';
import { AppProviders } from '@/ui/shared/AppProviders';
import { Popup } from './Popup';

const container = document.getElementById('root');
if (!container) throw new Error('Missing #root element');

createRoot(container).render(
  <StrictMode>
    <AppProviders>
      <Popup />
    </AppProviders>
  </StrictMode>,
);
