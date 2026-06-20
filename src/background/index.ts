/**
 * @fileoverview Background service worker entry point.
 *
 * Owns the {@link PrinterManager} (all live connections) and the
 * {@link MessageRouter} (UI traffic). An active WebSocket keeps the worker alive
 * on its own; a 1-minute `chrome.alarms` watchdog additionally revives any
 * connection that has dropped while the worker was briefly suspended.
 */
import { loadPrinters } from '@/core/settings/SettingsStore';
import { BadgeController } from './BadgeController';
import { PrinterManager } from './PrinterManager';
import { MessageRouter } from './router';

const WATCHDOG_ALARM = 'helmsman-watchdog';

const manager = new PrinterManager();
const router = new MessageRouter(manager);
const badge = new BadgeController(manager);

// Register all chrome.* listeners synchronously at top level so MV3 can route
// events to a freshly-woken worker.
router.start();
badge.start();

chrome.alarms.create(WATCHDOG_ALARM, { periodInMinutes: 1 });
chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === WATCHDOG_ALARM) manager.reviveDropped();
});

const reconnectAll = async (): Promise<void> => {
  manager.reconfigure(await loadPrinters());
};

chrome.runtime.onStartup.addListener(() => void reconnectAll());
chrome.runtime.onInstalled.addListener(() => void reconnectAll());

// Initial connect for the current worker lifetime.
void reconnectAll();
