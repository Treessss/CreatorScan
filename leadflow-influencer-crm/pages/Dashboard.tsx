
import React, { useEffect, useState } from 'react';
import { 
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Legend
} from 'recharts';
import { dashboardService } from '../services/api';

const StatCard: React.FC<{
  label: string;
  value: string;
  trend: string;
  isUp: boolean;
  icon: string;
  bgClass: string;
  iconColor: string;
}> = ({ label, value, trend, isUp, icon, bgClass, iconColor }) => (
  <div className="bg-white dark:bg-slate-900 p-6 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm">
    <div className="flex items-center justify-between mb-4">
      <div className={`p-2 rounded-lg ${bgClass} ${iconColor}`}>
        <span className="material-symbols-outlined">{icon}</span>
      </div>
      <span className={`text-xs font-bold px-2 py-1 rounded-full ${isUp ? 'text-green-600 bg-green-50 dark:bg-green-900/30' : 'text-red-600 bg-red-50 dark:bg-red-900/30'}`}>
        {isUp ? '+' : ''}{trend}
      </span>
    </div>
    <p className="text-slate-500 dark:text-slate-400 text-sm font-medium">{label}</p>
    <p className="text-2xl font-bold text-slate-900 dark:text-white mt-1">{value}</p>
  </div>
);

const Dashboard: React.FC = () => {
  const [stats, setStats] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchStats = async () => {
      try {
        const data = await dashboardService.getStats();
        setStats(data);
      } catch (error) {
        console.error("Failed to fetch dashboard stats:", error);
      } finally {
        setLoading(false);
      }
    };
    fetchStats();
  }, []);

  if (loading) {
    return <div className="p-8">Loading dashboard...</div>;
  }

  if (!stats) {
    return <div className="p-8">Failed to load dashboard data.</div>;
  }

  return (
    <div className="flex-1 h-full overflow-y-auto w-full">
      <div className="p-8 max-w-7xl mx-auto">
        <div className="mb-8">
        <h2 className="text-2xl font-bold text-slate-900 dark:text-white">仪表盘概览</h2>
        <p className="text-slate-500 dark:text-slate-400 mt-1">来自浏览器插件和活跃营销活动的实时数据推送。</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
        {stats.stats.map((stat: any, index: number) => (
            <StatCard key={index} {...stat} />
        ))}
        
        <div className="bg-white dark:bg-slate-900 p-4 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm">
          <p className="text-slate-900 dark:text-white text-sm font-bold mb-3">平台分布</p>
          <div className="h-24 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={stats.platform_distribution} innerRadius={20} outerRadius={40} paddingAngle={5} dataKey="value">
                  {stats.platform_distribution.map((entry: any, index: number) => <Cell key={`cell-${index}`} fill={entry.color} />)}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <div className="lg:col-span-8 bg-white dark:bg-slate-900 p-6 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm">
          <h3 className="text-lg font-bold text-slate-900 dark:text-white mb-6">新增线索趋势</h3>
          <div className="h-64 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={stats.leads_trend}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: '#64748b' }} />
                <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: '#64748b' }} />
                <Tooltip cursor={{ fill: '#f1f5f9' }} />
                <Bar dataKey="count" fill="#137fec" radius={[4, 4, 0, 0]} barSize={32} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="lg:col-span-4 bg-white dark:bg-slate-900 p-6 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm">
          <div className="flex items-center justify-between mb-6">
            <h3 className="text-lg font-bold text-slate-900 dark:text-white">最新动态</h3>
            <button className="text-xs font-bold text-primary hover:underline">查看全部</button>
          </div>
          <div className="space-y-6">
            {stats.recent_activity.length === 0 ? (
                <p className="text-sm text-slate-500">暂无动态</p>
            ) : (
                stats.recent_activity.map((activity: any) => (
                <div key={activity.id} className="flex gap-3">
                    <div className="size-8 rounded-full bg-slate-200 shrink-0" style={{ backgroundImage: `url('${activity.avatar}')`, backgroundSize: 'cover' }}></div>
                    <div>
                    <p className="text-sm font-semibold text-slate-900 dark:text-white leading-tight">{activity.name}</p>
                    <p className="text-xs text-slate-500 mt-0.5">{activity.description}</p>
                    <p className="text-[10px] text-slate-400 mt-1">{activity.time}</p>
                    </div>
                </div>
                ))
            )}
          </div>
        </div>
      </div>
    </div>
  </div>
  );
};

export default Dashboard;
