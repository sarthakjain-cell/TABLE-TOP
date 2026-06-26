const fs = require('fs');
const path = require('path');

const pagePath = path.join(__dirname, 'frontend', 'app', 'admin', 'page.tsx');
let content = fs.readFileSync(pagePath, 'utf8');

// 1. Add Recharts Imports
if (!content.includes('recharts')) {
  content = content.replace(
    "import { LayoutDashboard, Folder, FolderPlus, ArrowLeft, Utensils, IndianRupee, Bell, Plus, Trash2, Download, Lock, CheckCircle2, TrendingUp, Calendar, Building2, Landmark, Receipt, UploadCloud, Loader2, X, Settings } from 'lucide-react';",
    "import { LayoutDashboard, Folder, FolderPlus, ArrowLeft, Utensils, IndianRupee, Bell, Plus, Trash2, Download, Lock, CheckCircle2, TrendingUp, Calendar, Building2, Landmark, Receipt, UploadCloud, Loader2, X, Settings } from 'lucide-react';\nimport { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';"
  );
}

// 2. Add chart data processing logic inside the component, near the top of the return block
const chartDataCode = `
  const chartData = React.useMemo(() => {
    const daily: Record<string, number> = {};
    transactions.forEach(tx => {
      const date = new Date(tx.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
      daily[date] = (daily[date] || 0) + parseFloat(tx.amount || '0');
    });
    return Object.entries(daily).map(([date, revenue]) => ({ date, revenue }));
  }, [transactions]);

  const downloadCSV = () => {
    if (transactions.length === 0) {
      alert("No transactions to export.");
      return;
    }
    const headers = ['ID', 'Date', 'Amount', 'Tax', 'Customer Name', 'Customer Phone'];
    const rows = transactions.map(tx => [
      tx.id,
      new Date(tx.createdAt).toLocaleString(),
      tx.amount,
      tx.taxPaid,
      tx.customerName || 'N/A',
      tx.customerPhone || 'N/A'
    ]);
    const csvContent = "data:text/csv;charset=utf-8," 
      + [headers.join(","), ...rows.map(e => e.join(","))].join("\\n");
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", \`ledger_export_\${new Date().toISOString().split('T')[0]}.csv\`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };
`;

if (!content.includes('const chartData = React.useMemo(')) {
  content = content.replace(
    "const appOrigin = typeof window !== 'undefined' ? window.location.origin : '';",
    "const appOrigin = typeof window !== 'undefined' ? window.location.origin : '';\n" + chartDataCode
  );
}

// 3. Inject Chart & CSV Button into Dashboard Tab
const chartUI = `
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-8">
                <div className="lg:col-span-2 bg-white rounded-2xl p-6 shadow-sm border border-gray-100">
                  <div className="flex justify-between items-center mb-6">
                    <h3 className="text-lg font-bold text-gray-900 flex items-center gap-2">
                      <TrendingUp size={20} className="text-blue-600" /> Revenue Trend
                    </h3>
                    <button onClick={downloadCSV} className="flex items-center gap-2 bg-gray-100 hover:bg-gray-200 text-gray-700 px-3 py-1.5 rounded-lg text-sm font-semibold transition-colors">
                      <Download size={16} /> Export CSV
                    </button>
                  </div>
                  <div className="h-64 w-full">
                    {chartData.length > 0 ? (
                      <ResponsiveContainer width="100%" height="100%">
                        <AreaChart data={chartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                          <defs>
                            <linearGradient id="colorRevenue" x1="0" y1="0" x2="0" y2="1">
                              <stop offset="5%" stopColor="#2563EB" stopOpacity={0.3}/>
                              <stop offset="95%" stopColor="#2563EB" stopOpacity={0}/>
                            </linearGradient>
                          </defs>
                          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E5E7EB" />
                          <XAxis dataKey="date" axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: '#6B7280' }} dy={10} />
                          <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: '#6B7280' }} tickFormatter={(val) => \`$\${val}\`} />
                          <Tooltip 
                            contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
                            formatter={(value: any) => [\`$\${Number(value).toFixed(2)}\`, 'Revenue']}
                          />
                          <Area type="monotone" dataKey="revenue" stroke="#2563EB" strokeWidth={3} fillOpacity={1} fill="url(#colorRevenue)" />
                        </AreaChart>
                      </ResponsiveContainer>
                    ) : (
                      <div className="h-full w-full flex items-center justify-center text-gray-400 text-sm font-medium">
                        Not enough data yet.
                      </div>
                    )}
                  </div>
                </div>
                <div className="bg-gradient-to-br from-emerald-500 to-teal-600 rounded-2xl p-6 shadow-xl text-white relative overflow-hidden flex flex-col justify-center">
                  <div className="absolute -right-8 -top-8 text-white/10 text-9xl">✨</div>
                  <div className="relative z-10">
                    <h3 className="text-emerald-50 font-bold uppercase tracking-widest text-xs mb-1 flex items-center gap-2">
                      <TrendingUp size={14} /> AI Sales Intelligence
                    </h3>
                    <p className="text-4xl lg:text-5xl font-black tracking-tight mt-2 mb-4">
                      \${aiRoiTotal.toFixed(2)}
                    </p>
                    <p className="text-emerald-100 text-sm font-medium">Extra revenue generated by AI recommendations this month</p>
                  </div>
                </div>
              </div>
`;

if (!content.includes('<AreaChart')) {
  // Replace the old AI Sales Intelligence block with the new grid containing chart + AI block
  content = content.replace(
    /<div className="bg-gradient-to-r from-emerald-500 to-teal-600 rounded-2xl p-6 shadow-xl text-white relative overflow-hidden mb-8">[\s\S]*?Active & Selling\n\s*<\/div>\n\s*<\/div>\n\s*<\/div>/,
    chartUI
  );
}

fs.writeFileSync(pagePath, content);
console.log("Admin Dashboard Patched");
