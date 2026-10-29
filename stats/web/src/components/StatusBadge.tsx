export default function StatusBadge({ online }: { online: boolean }) {
  return <span className={`badge ${online ? 'online' : 'offline'}`}>{online ? 'online' : 'offline'}</span>;
}
