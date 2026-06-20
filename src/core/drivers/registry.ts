/**
 * @fileoverview Driver registry — maps a {@link PrinterType} to a factory.
 *
 * This is the single extension point for new backends. To add OctoPrint:
 * implement `OctoPrintDriver implements PrinterDriver`, then add one entry here.
 * No UI or background code needs to change.
 */
import type { PrinterConfig, PrinterType } from '@/core/printers/printerConfig';
import type { PrinterDriver } from './PrinterDriver';
import { MoonrakerDriver } from './moonraker/MoonrakerDriver';

type DriverFactory = (config: PrinterConfig) => PrinterDriver;

const FACTORIES: Readonly<Record<PrinterType, DriverFactory>> = {
  moonraker: (config) => new MoonrakerDriver(config),
};

/** Construct the driver for a printer config's backend type. */
export const createDriver = (config: PrinterConfig): PrinterDriver => {
  const factory = FACTORIES[config.type];
  if (!factory) {
    throw new Error(`No driver registered for printer type "${config.type}"`);
  }
  return factory(config);
};

/** Type guard: is `value` a registered (supported) printer type? */
export const isPrinterType = (value: string): value is PrinterType =>
  Object.prototype.hasOwnProperty.call(FACTORIES, value);

/** The set of backend types the app can currently drive. */
export const supportedPrinterTypes: readonly PrinterType[] =
  Object.keys(FACTORIES).filter(isPrinterType);
