/**
 * @fileoverview Imperative confirmation dialog: `const confirm = useConfirm()`
 * then `if (await confirm({ … })) doIt()`. A single themed dialog lives at the
 * provider so any component (header buttons, panels) can prompt without
 * managing its own dialog state.
 */
import {
  Button,
  type ButtonProps,
  Dialog,
  DialogActions,
  DialogContent,
  DialogContentText,
  DialogTitle,
} from '@mui/material';
import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';

export interface ConfirmOptions {
  readonly title: string;
  readonly message: string;
  readonly confirmLabel?: string;
  readonly cancelLabel?: string;
  readonly confirmColor?: ButtonProps['color'];
}

type ConfirmFn = (options: ConfirmOptions) => Promise<boolean>;

const ConfirmContext = createContext<ConfirmFn>(async () => true);

interface PendingConfirm {
  readonly options: ConfirmOptions;
  readonly resolve: (result: boolean) => void;
}

export function ConfirmProvider({ children }: { children: ReactNode }): JSX.Element {
  const [pending, setPending] = useState<PendingConfirm>();

  const confirm = useCallback<ConfirmFn>(
    (options) => new Promise<boolean>((resolve) => setPending({ options, resolve })),
    [],
  );

  const settle = (result: boolean): void => {
    pending?.resolve(result);
    setPending(undefined);
  };

  const value = useMemo(() => confirm, [confirm]);

  return (
    <ConfirmContext.Provider value={value}>
      {children}
      <Dialog open={pending !== undefined} onClose={() => settle(false)} maxWidth="xs">
        {pending && (
          <>
            <DialogTitle>{pending.options.title}</DialogTitle>
            <DialogContent>
              <DialogContentText>{pending.options.message}</DialogContentText>
            </DialogContent>
            <DialogActions>
              <Button onClick={() => settle(false)} autoFocus>
                {pending.options.cancelLabel ?? 'Cancel'}
              </Button>
              <Button
                variant="contained"
                color={pending.options.confirmColor ?? 'primary'}
                onClick={() => settle(true)}
              >
                {pending.options.confirmLabel ?? 'Confirm'}
              </Button>
            </DialogActions>
          </>
        )}
      </Dialog>
    </ConfirmContext.Provider>
  );
}

export const useConfirm = (): ConfirmFn => useContext(ConfirmContext);
