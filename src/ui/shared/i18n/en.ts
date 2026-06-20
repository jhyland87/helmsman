/**
 * @fileoverview English message catalog. Add a sibling file (e.g. `de.ts`) with
 * the same keys and register it in `index.tsx` to add a locale.
 */
export const en = {
  'app.title': 'Helmsman',
  'app.settings': 'Settings',
  'app.noPrinters': 'No printers configured yet.',
  'app.addPrinter': 'Add a printer',
  'app.openSettings': 'Open settings',

  'nav.dashboard': 'Dashboard',
  'nav.layout': 'Dashboard Layout',
  'nav.printers': 'Printers',
  'nav.history': 'History & Statistics',
  'nav.settings': 'Settings',
  'nav.system': 'System Stats',

  'conn.connected': 'Connected',
  'conn.connecting': 'Connecting…',
  'conn.disconnected': 'Disconnected',
  'conn.error': 'Error',

  'panel.printer-status': 'Print Status',
  'panel.temperature': 'Temperatures',
  'panel.console': 'Console',
  'panel.macros': 'Macros',
  'panel.fans': 'Fans & Outputs',
  'panel.toolhead': 'Toolhead',
  'panel.limits': 'Printer Limits',
  'panel.webcam': 'Webcam',
  'panel.print-jobs': 'Print Jobs',
  'panel.print-queue': 'Print Queue',
  'panel.bed-mesh': 'Bed Mesh',
  'panel.files': 'G-code Files',

  'temp.actual': 'Actual',
  'temp.target': 'Target',
  'temp.setTarget': 'Set target',

  'console.send': 'Send',
  'console.placeholder': 'Enter a G-code command…',

  'toolhead.home': 'Home All',
  'toolhead.position': 'Position',

  'limits.velocity': 'Velocity',
  'limits.accel': 'Acceleration',
  'limits.accelToDecel': 'Accel to Decel',
  'limits.squareCornerVelocity': 'Square Corner Velocity',

  'job.pause': 'Pause',
  'job.resume': 'Resume',
  'job.cancel': 'Cancel',
  'job.emergencyStop': 'Emergency Stop',

  'settings.theme': 'Color theme',
  'settings.fontSize': 'Font size',
  'settings.language': 'Language',
  'settings.storage': 'Settings storage',
  'settings.dashboardStorage': 'Dashboard storage',
  'settings.webcamBackground': 'Use webcam feed as popup background',
  'settings.confirmEmergencyStop': 'Confirm before emergency stop',
  'settings.confirmPrintActions': 'Confirm before pausing/cancelling a print',

  'confirm.emergencyStop.title': 'Emergency Stop',
  'confirm.emergencyStop.message':
    'This halts the printer immediately and requires a firmware restart to recover. Continue?',
  'confirm.pause.title': 'Pause print',
  'confirm.pause.message': 'Pause the current print?',
  'confirm.cancel.title': 'Cancel print',
  'confirm.cancel.message': 'Cancel the current print? This cannot be undone.',
} as const;

export type MessageKey = keyof typeof en;
export type Messages = Readonly<Record<MessageKey, string>>;
