/**
 * @fileoverview Always-available Emergency Stop button for app headers, so it's
 * reachable even when the Print Status panel is hidden. Prompts for confirmation
 * unless disabled in settings.
 */
import DangerousIcon from '@mui/icons-material/Dangerous';
import { IconButton, Tooltip } from '@mui/material';

import { api } from '@/ui/shared/api';
import { useT } from '@/ui/shared/i18n';
import { useConfirm } from '@/ui/shared/state/ConfirmContext';
import { useSettings } from '@/ui/shared/state/SettingsContext';

export function EmergencyStopButton({ printerId }: { printerId?: string }): JSX.Element | null {
  const t = useT();
  const confirm = useConfirm();
  const { settings } = useSettings();

  if (!printerId) return null;

  const onClick = async (): Promise<void> => {
    if (settings.confirmEmergencyStop) {
      const ok = await confirm({
        title: t('confirm.emergencyStop.title'),
        message: t('confirm.emergencyStop.message'),
        confirmLabel: t('job.emergencyStop'),
        confirmColor: 'error',
      });
      if (!ok) return;
    }
    await api.emergencyStop(printerId);
  };

  return (
    <Tooltip title={t('job.emergencyStop')}>
      <IconButton
        aria-label={t('job.emergencyStop')}
        onClick={() => void onClick()}
        sx={{
          color: 'error.contrastText',
          bgcolor: 'error.main',
          '&:hover': { bgcolor: 'error.dark' },
        }}
      >
        <DangerousIcon fontSize="small" />
      </IconButton>
    </Tooltip>
  );
}
