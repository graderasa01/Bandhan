"use client";
import { useState } from "react";
import Badge from "@/components/ui/Badge";

interface Column { key: string; label: string; }
interface Row { [key: string]: string | number; }
interface Action { label: string; onClick: (row: Row) => void; variant?: string; }

interface Props {
  columns: Column[];
  rows: Row[];
  actions?: Action[];
  statusKey?: string;
}

export default function AdminReviewTable({ columns, rows, actions, statusKey }: Props) {
  const [search, setSearch] = useState("");
  const filtered = rows.filter((r) =>
    Object.values(r).some((v) => String(v).toLowerCase().includes(search.toLowerCase()))
  );

  return (
    <div>
      <input
        type="text" placeholder="Search..." value={search} onChange={(e) => setSearch(e.target.value)}
        className="w-full md:w-64 px-3 py-2 border border-stone-300 rounded-lg text-sm mb-4 focus:outline-none focus:ring-2 focus:ring-amber-500"
      />
      {/* Desktop Table */}
      <div className="hidden md:block overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-stone-100 text-left">
              {columns.map((c) => <th key={c.key} className="px-4 py-3 font-semibold text-stone-600">{c.label}</th>)}
              {actions && <th className="px-4 py-3 font-semibold text-stone-600">Actions</th>}
            </tr>
          </thead>
          <tbody>
            {filtered.map((row, i) => (
              <tr key={i} className={`border-b border-stone-200 ${i % 2 === 0 ? "bg-white" : "bg-stone-50"}`}>
                {columns.map((c) => (
                  <td key={c.key} className="px-4 py-3">
                    {statusKey && c.key === statusKey ? <Badge variant="pending">{row[c.key]}</Badge> : String(row[c.key] ?? "")}
                  </td>
                ))}
                {actions && (
                  <td className="px-4 py-3">
                    <div className="flex gap-2">
                      {actions.map((a) => (
                        <button key={a.label} onClick={() => a.onClick(row)} className={`text-xs font-medium px-2 py-1 rounded ${a.variant === "danger" ? "text-red-600 hover:bg-red-50" : "text-amber-600 hover:bg-amber-50"}`}>{a.label}</button>
                      ))}
                    </div>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {/* Mobile Cards */}
      <div className="md:hidden space-y-3">
        {filtered.map((row, i) => (
          <div key={i} className="bg-white border border-stone-200 rounded-xl p-3 shadow-sm">
            {columns.map((c) => (
              <div key={c.key} className="flex justify-between text-sm py-1">
                <span className="text-stone-500">{c.label}</span>
                <span className="font-medium text-gray-700">{statusKey && c.key === statusKey ? <Badge variant="pending">{row[c.key]}</Badge> : String(row[c.key] ?? "")}</span>
              </div>
            ))}
            {actions && (
              <div className="flex gap-2 mt-2 pt-2 border-t border-stone-100">
                {actions.map((a) => (
                  <button key={a.label} onClick={() => a.onClick(row)} className={`text-xs font-medium px-2 py-1 rounded ${a.variant === "danger" ? "text-red-600 hover:bg-red-50" : "text-amber-600 hover:bg-amber-50"}`}>{a.label}</button>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}