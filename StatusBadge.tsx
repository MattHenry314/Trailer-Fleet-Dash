function classFor(status: string | null) {
  switch (status) {
    case 'Available': return 'available';
    case 'Leased': return 'leased';
    case 'Pending Lease': return 'pending';
    case 'Remediation': return 'remediation';
    case 'Out of Service': return 'oos';
    case 'Sold': return 'sold';
    default: return 'oos';
  }
}

export default function StatusBadge({ status }: { status: string | null }) {
  return <span className={`badge ${classFor(status)}`}>{status || 'Unknown'}</span>;
}
