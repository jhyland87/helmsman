/**
 * @fileoverview Print queue panel — lists queued jobs (scaffolded; extend with
 * reorder/remove controls).
 */
import { List, ListItem, ListItemText, Typography } from '@mui/material';
import { useEffect, useState } from 'react';

import type { JobQueueStatus } from '@jhyland87/moonraker-client';

import { api } from '@/ui/shared/api';
import type { PanelProps } from './PanelProps';

export function PrintQueuePanel({ printerId }: PanelProps): JSX.Element {
  const [queue, setQueue] = useState<JobQueueStatus>();
  const [error, setError] = useState(false);

  useEffect(() => {
    let active = true;
    const loadQueue = async (): Promise<void> => {
      try {
        const q = await api.getJobQueue(printerId);
        if (active) setQueue(q);
      } catch {
        if (active) setError(true);
      }
    };
    void loadQueue();
    return () => {
      active = false;
    };
  }, [printerId]);

  if (error) {
    return <Typography variant="body2" color="text.secondary">Queue unavailable.</Typography>;
  }
  if (!queue || queue.queued_jobs.length === 0) {
    return <Typography variant="body2" color="text.secondary">Queue is empty.</Typography>;
  }

  return (
    <List dense disablePadding>
      {queue.queued_jobs.map((job) => (
        <ListItem key={job.job_id} disableGutters>
          <ListItemText primary={job.filename} />
        </ListItem>
      ))}
    </List>
  );
}
