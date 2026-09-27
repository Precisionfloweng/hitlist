export default function Breakdown({ title, rows }: { title: string; rows: { value: string; count: number }[] }) {
  const max = Math.max(1, ...rows.map((r) => r.count));
  return (
    <div className="card">
      <b>{title}</b>
      {rows.length === 0 ? <p className="muted">None</p> : (
        <table style={{ marginTop: 8 }}><tbody>
          {rows.map((r) => (
            <tr key={r.value}><td style={{ width: "45%" }}>{r.value}</td>
              <td><div className="bar"><span style={{ width: `${(100 * r.count) / max}%` }} /></div></td>
              <td className="num" style={{ width: 50 }}>{r.count}</td></tr>
          ))}
        </tbody></table>
      )}
    </div>
  );
}
