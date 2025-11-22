import React, { useMemo, useState, useEffect } from "react";

/**
 * GroupedTableWithoutVirtualization
 *
 * Props:
 *  - data: Array of rows { id, channel, region, spend, impressions, conversions, clicks }
 *  - regionPageSize?: number (default 10)
 *
 * Behavior:
 *  - Top-level sort (entire dataset sorted first, then grouped)
 *  - Filter across channel and region
 *  - Collapsible channels and regions
 *  - Per-region pagination when region is expanded
 *
 * Notes:
 *  - This version intentionally avoids virtualization libraries.
 *  - It's efficient for very large datasets because the DOM only renders:
 *      channel headers + region headers + current page rows for expanded regions + subtotals + grand total
 *  - For extremely large datasets, consider server-side sort/filter or web-worker processing.
 */

// Simple inline CSS (you can extract to .css file)
const styles = `
.gtv-container { font-family: Arial, Helvetica, sans-serif; margin:16px; color:#111827; }
.gtv-header { display:flex; align-items:center; gap:12px; margin-bottom:12px; }
.gtv-title { font-size:20px; font-weight:700; }
.gtv-controls { margin-left:auto; display:flex; gap:8px; align-items:center; }
.gtv-search { padding:6px 8px; border:1px solid #d1d5db; border-radius:6px; }

.gtv-table { border:1px solid #e5e7eb; border-radius:8px; overflow:hidden; }
.gtv-row { display:flex; align-items:center; padding:10px 12px; border-bottom:1px solid #f3f4f6; box-sizing:border-box; }
.gtv-row.row-odd { background:#ffffff; }
.gtv-row.row-even { background:#fbfbfd; }

.gtv-channel { font-weight:700; display:flex; align-items:center; gap:8px; cursor:pointer; background:#eef2ff; }
.gtv-region { padding-left:18px; display:flex; align-items:center; gap:8px; cursor:pointer; background:#f8fafc; }
.gtv-data { padding-left:28px; display:flex; gap:12px; align-items:center; }

.gtv-cell { flex:1; min-width:80px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; font-size:13px; }
.gtv-cell.small { flex:0 0 120px; text-align:right; }

.gtv-subtotal { background:#f1f5f9; font-weight:700; display:flex; padding:10px 12px; gap:12px; align-items:center; }
.gtv-grandtotal { background:#e8f0ff; font-weight:800; display:flex; padding:10px 12px; gap:12px; align-items:center; }

.gtv-pager { margin-left:auto; display:flex; gap:8px; align-items:center; }
.gtv-pager button { padding:6px 8px; border:1px solid #d1d5db; background:white; border-radius:6px; cursor:pointer; }
.gtv-pager button[disabled]{ opacity:0.5; cursor:not-allowed; }

.gtv-img { width:40px; height:40px; object-fit:cover; border-radius:6px; border:1px solid #e6e6ef; }
.gtv-meta { color:#6b7280; font-size:13px; }
`;

// Format helpers
const fmt = {
    currency: (v) => (typeof v === "number" ? `₹${v.toLocaleString()}` : v),
    number: (v) => (typeof v === "number" ? v.toLocaleString() : v)
};

export default function GroupedTableWithoutVirtualization({ data, regionPageSize = 10 }) {
    // UI state
    const [filterText, setFilterText] = useState("");
    const [sortField, setSortField] = useState(null); // e.g. 'spend', 'impressions', etc.
    const [sortOrder, setSortOrder] = useState("asc");

    // collapse / paging state
    const [expandedChannels, setExpandedChannels] = useState({}); // { [channel]: true }
    const [expandedRegions, setExpandedRegions] = useState({}); // { `${channel}:::${region}`: true }
    const [regionPage, setRegionPage] = useState({}); // { `${channel}:::${region}`: pageNumber }

    // Debounced search value (small debounce to avoid re-filtering on every keystroke)
    const [debouncedFilter, setDebouncedFilter] = useState(filterText);
    useEffect(() => {
        const t = setTimeout(() => setDebouncedFilter(filterText.trim().toLowerCase()), 200);
        return () => clearTimeout(t);
    }, [filterText]);

    // 1) Filter
    const filtered = useMemo(() => {
        if (!debouncedFilter) return data;
        const q = debouncedFilter;
        return data.filter((r) => `${r.channel} ${r.region}`.toLowerCase().includes(q));
    }, [data, debouncedFilter]);

    // 2) Sort (top-level sort across the whole dataset, then group)
    const sorted = useMemo(() => {
        if (!sortField) return filtered;
        const copy = [...filtered];
        copy.sort((a, b) => {
            const x = a[sortField];
            const y = b[sortField];
            if (typeof x === "string") {
                return sortOrder === "asc" ? x.localeCompare(y) : y.localeCompare(x);
            }
            // numeric (fallback NaN safe)
            return sortOrder === "asc" ? (x - y) : (y - x);
        });
        return copy;
    }, [filtered, sortField, sortOrder]);

    // 3) Group into channel -> region -> rows
    const grouped = useMemo(() => {
        const g = {};
        for (const row of sorted) {
            if (!g[row.channel]) g[row.channel] = {};
            if (!g[row.channel][row.region]) g[row.channel][row.region] = [];
            g[row.channel][row.region].push(row);
        }
        return g;
    }, [sorted]);

    // subtotal helpers
    const getChannelTotals = (channelRegions) => {
        const totals = { spend: 0, impressions: 0, conversions: 0, clicks: 0 };
        Object.values(channelRegions)
            .flat()
            .forEach((r) => {
                totals.spend += r.spend || 0;
                totals.impressions += r.impressions || 0;
                totals.conversions += r.conversions || 0;
                totals.clicks += r.clicks || 0;
            });
        return totals;
    };

    const grandTotals = useMemo(() => {
        return sorted.reduce(
            (acc, r) => {
                acc.spend += r.spend || 0;
                acc.impressions += r.impressions || 0;
                acc.conversions += r.conversions || 0;
                acc.clicks += r.clicks || 0;
                return acc;
            },
            { spend: 0, impressions: 0, conversions: 0, clicks: 0 }
        );
    }, [sorted]);

    // toggle handlers
    const toggleChannel = (channel) => {
        setExpandedChannels((p) => {
            const next = { ...p, [channel]: !p[channel] };
            return next;
        });
    };

    const toggleRegion = (channel, region) => {
        const key = `${channel}:::${region}`;
        setExpandedRegions((p) => ({ ...p, [key]: !p[key] }));
        setRegionPage((p) => ({ ...p, [key]: p[key] ?? 1 })); // ensure page exists
    };

    const setPageForRegion = (channel, region, page) => {
        const key = `${channel}:::${region}`;
        setRegionPage((p) => ({ ...p, [key]: page }));
    };

    // handle sort changes (reset region pages to 1 to avoid inconsistent page)
    const handleSort = (field) => {
        if (sortField === field) {
            setSortOrder((s) => (s === "asc" ? "desc" : "asc"));
        } else {
            setSortField(field);
            setSortOrder("asc");
        }
        // reset region pages to 1 to keep semantics predictable
        setRegionPage({});
    };

    // Render helpers
    const renderChannelRow = (channel, idx) => {
        const expanded = !!expandedChannels[channel];
        return (
            <div key={`channel-${channel}`} className={`gtv-row gtv-channel ${idx % 2 ? "row-odd" : "row-even"}`} onClick={() => toggleChannel(channel)}>
                <div className="gtv-cell" style={{ flex: 2 }}>
                    <span style={{ marginRight: 8 }}>{expanded ? "▼" : "▶"}</span>
                    <strong>{channel}</strong>
                </div>
                <div className="gtv-cell gtv-meta" style={{ flex: 1 }}> </div>
                <div className="gtv-cell gtv-meta" style={{ flex: 1 }}> </div>
                <div className="gtv-cell gtv-meta" style={{ flex: 1, textAlign: "right" }}>Spend</div>
                <div className="gtv-cell gtv-meta" style={{ flex: 1, textAlign: "right" }}>Impr.</div>
                <div className="gtv-cell gtv-meta" style={{ flex: 1, textAlign: "right" }}>Conv.</div>
                <div className="gtv-cell gtv-meta" style={{ width: 120, textAlign: "right" }}>Clicks</div>
            </div>
        );
    };

    const renderRegionHeader = (channel, region, idx) => {
        const key = `${channel}:::${region}`;
        const expanded = !!expandedRegions[key];
        return (
            <div key={`region-${channel}-${region}`} className={`gtv-row gtv-region ${idx % 2 ? "row-odd" : "row-even"}`} onClick={() => toggleRegion(channel, region)}>
                <div className="gtv-cell" style={{ flex: 2 }}>
                    <span style={{ marginRight: 8 }}>{expanded ? "▼" : "▶"}</span>
                    <span>{region}</span>
                </div>
                <div className="gtv-cell gtv-meta" style={{ flex: 1 }}> </div>
                <div className="gtv-cell gtv-meta" style={{ flex: 1 }}> </div>
                <div className="gtv-cell gtv-meta" style={{ flex: 1, textAlign: "right" }}> </div>
                <div className="gtv-cell gtv-meta" style={{ flex: 1, textAlign: "right" }}> </div>
                <div className="gtv-cell gtv-meta" style={{ flex: 1, textAlign: "right" }}> </div>
                <div className="gtv-cell gtv-meta" style={{ width: 120, textAlign: "right" }}> </div>
            </div>
        );
    };

    const renderDataRow = (row, idx) => {
        return (
            <div key={`row-${row.id}`} className={`gtv-row gtv-data ${idx % 2 ? "row-odd" : "row-even"}`}>
                <div className="gtv-cell" style={{ flex: 0.7 }}>{row.id}</div>
                <div className="gtv-cell" style={{ flex: 1.2 }}>{row.channel}</div>
                <div className="gtv-cell" style={{ flex: 1.2 }}>{row.region}</div>
                <div className="gtv-cell small" style={{ flex: 1, textAlign: "right" }}>{fmt.currency(row.spend)}</div>
                <div className="gtv-cell small" style={{ flex: 1, textAlign: "right" }}>{fmt.number(row.impressions)}</div>
                <div className="gtv-cell small" style={{ flex: 1, textAlign: "right" }}>{fmt.number(row.conversions)}</div>
                <div className="gtv-cell small" style={{ width: 120, textAlign: "right" }}>{fmt.number(row.clicks)}</div>
            </div>
        );
    };

    const renderChannelSubtotal = (channel, totals) => (
        <div key={`subtotal-${channel}`} className="gtv-subtotal">
            <div style={{ flex: 2, textAlign: "right" }}>Subtotal ({channel})</div>
            <div style={{ flex: 1 }} />
            <div style={{ flex: 1 }} />
            <div style={{ flex: 1, textAlign: "right" }}>{fmt.currency(totals.spend)}</div>
            <div style={{ flex: 1, textAlign: "right" }}>{fmt.number(totals.impressions)}</div>
            <div style={{ flex: 1, textAlign: "right" }}>{fmt.number(totals.conversions)}</div>
            <div style={{ width: 120, textAlign: "right" }}>{fmt.number(totals.clicks)}</div>
        </div>
    );

    // Main render assembly
    const channelKeys = Object.keys(grouped);
    return (
        <div className="gtv-container">
            <style>{styles}</style>

            <div className="gtv-header">
                <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                    <div>
                        <div className="gtv-title">Marketing Dashboard</div>
                        <div className="gtv-meta">Grouped by Channel → Region (per-region paging)</div>
                    </div>
                </div>

                <div className="gtv-controls">
                    <input className="gtv-search" placeholder="Search channel or region..." value={filterText} onChange={(e) => setFilterText(e.target.value)} />
                </div>
            </div>

            <div style={{ marginBottom: 8, display: "flex", gap: 12 }}>
                <div style={{ display: "flex", gap: 8 }}>
                    <button onClick={() => handleSort("spend")}>Sort Spend</button>
                    <button onClick={() => handleSort("impressions")}>Sort Impr.</button>
                    <button onClick={() => handleSort("conversions")}>Sort Conv.</button>
                </div>
                <div style={{ marginLeft: "auto", color: "#6b7280", fontSize: 13 }}>Showing {sorted.length} rows</div>
            </div>

            <div className="gtv-table" role="table" aria-label="Grouped marketing table">
                {/* Table header row */}
                <div className="gtv-row" style={{ background: "#f8fafc", fontWeight: 700 }}>
                    <div className="gtv-cell" style={{ flex: 0.7 }}>ID</div>
                    <div className="gtv-cell" style={{ flex: 1.2 }}>Channel</div>
                    <div className="gtv-cell" style={{ flex: 1.2 }}>Region</div>
                    <div className="gtv-cell small" style={{ flex: 1, textAlign: "right" }}>Spend</div>
                    <div className="gtv-cell small" style={{ flex: 1, textAlign: "right" }}>Impressions</div>
                    <div className="gtv-cell small" style={{ flex: 1, textAlign: "right" }}>Conversions</div>
                    <div className="gtv-cell small" style={{ width: 120, textAlign: "right" }}>Clicks</div>
                </div>

                {/* Body */}
                <div>
                    {channelKeys.length === 0 && (
                        <div style={{ padding: 12 }}>No data</div>
                    )}

                    {channelKeys.map((channel, cIdx) => {
                        const channelRegions = grouped[channel];
                        const regionKeys = Object.keys(channelRegions);
                        const channelTotals = getChannelTotals(channelRegions);

                        return (
                            <div key={`group-${channel}`}>
                                {renderChannelRow(channel, cIdx)}

                                {expandedChannels[channel] && regionKeys.map((region, rIdx) => {
                                    const regionKey = `${channel}:::${region}`;
                                    const rows = channelRegions[region] || [];
                                    const expanded = !!expandedRegions[regionKey];
                                    // per-region page
                                    const page = regionPage[regionKey] || 1;
                                    const totalPages = Math.max(1, Math.ceil(rows.length / regionPageSize));
                                    const pageIndex = Math.max(0, Math.min(page - 1, totalPages - 1));
                                    const start = pageIndex * regionPageSize;
                                    const end = Math.min(start + regionPageSize, rows.length);
                                    const pageRows = rows.slice(start, end);

                                    return (
                                        <div key={`region-block-${channel}-${region}`}>
                                            {renderRegionHeader(channel, region, rIdx)}

                                            {/* rows (paginated) */}
                                            {expanded && pageRows.map((r, idx) => renderDataRow(r, idx))}

                                            {/* pager (shown only when region expanded) */}
                                            {expanded && (
                                                <div style={{ display: "flex", alignItems: "center", padding: "8px 12px" }}>
                                                    <div style={{ color: "#374151" }}>
                                                        Showing {rows.length === 0 ? 0 : (start + 1)} - {end} of {rows.length}
                                                    </div>

                                                    <div className="gtv-pager" role="navigation" aria-label={`Pagination for ${region}`}>
                                                        <div style={{ fontSize: 13, color: "#374151" }}>Page {page} / {totalPages}</div>

                                                        <button onClick={() => setPageForRegion(channel, region, Math.max(1, page - 1))} disabled={page <= 1}>Prev</button>
                                                        <button onClick={() => setPageForRegion(channel, region, Math.min(totalPages, page + 1))} disabled={page >= totalPages}>Next</button>
                                                    </div>
                                                </div>
                                            )}
                                        </div>
                                    );
                                })}

                                {/* channel subtotal (shown when channel expanded) */}
                                {expandedChannels[channel] && renderChannelSubtotal(channel, channelTotals)}
                            </div>
                        );
                    })}

                    {/* grand total */}
                    <div style={{ marginTop: 6 }}>
                        <div className="gtv-grandtotal">
                            <div style={{ flex: 2, textAlign: "right" }}>GRAND TOTAL</div>
                            <div style={{ flex: 1 }} />
                            <div style={{ flex: 1 }} />
                            <div style={{ flex: 1, textAlign: "right" }}>{fmt.currency(grandTotals.spend)}</div>
                            <div style={{ flex: 1, textAlign: "right" }}>{fmt.number(grandTotals.impressions)}</div>
                            <div style={{ flex: 1, textAlign: "right" }}>{fmt.number(grandTotals.conversions)}</div>
                            <div style={{ width: 120, textAlign: "right" }}>{fmt.number(grandTotals.clicks)}</div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
