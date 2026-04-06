interface Column<T> {
  key: string;
  label: string;
  render?: (row: T) => React.ReactNode;
}

interface DataTableProps<T> {
  columns: Column<T>[];
  data: T[];
  loading?: boolean;
  keyField?: string;
}

export default function DataTable<T extends Record<string, unknown>>({
  columns, data, loading, keyField = 'id'
}: DataTableProps<T>) {
  if (loading) return (
    <div className="flex items-center justify-center h-32">
      <div className="animate-spin w-8 h-8 border-4 border-gray-200 rounded-full" style={{ borderTopColor: '#c9a84c' }} />
    </div>
  );

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-gray-200">
            {columns.map((col) => (
              <th key={col.key} className="text-left py-3 px-4 text-gray-500 font-medium text-xs uppercase tracking-wide">
                {col.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {data.length === 0 ? (
            <tr><td colSpan={columns.length} className="text-center py-8 text-gray-400">No records found</td></tr>
          ) : data.map((row, i) => (
            <tr key={String(row[keyField]) ?? i} className="border-b border-gray-50 hover:bg-gray-50 transition-colors">
              {columns.map((col) => (
                <td key={col.key} className="py-3 px-4 text-gray-700">
                  {col.render ? col.render(row) : String(row[col.key] ?? '—')}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
