import React from 'react';
import UpdateWindowsCard from '@/features/system/components/UpdateWindowsCard';

// Fleet update schedules live on their own page (opened from the Nodes
// top-right pill), mirroring how NodeStats owns the statistics view.
// The card carries its own title + "New schedule" button.
const NodeSchedules: React.FC = () => {
  return (
    <div>
      <UpdateWindowsCard
        target="fleet"
        title="Fleet Update Schedules"
        description="Cron schedules that run the fleet rolling update inside a daily maintenance window (UTC). Outside the window the run is skipped and logged — never executed."
      />
    </div>
  );
};

export default NodeSchedules;
