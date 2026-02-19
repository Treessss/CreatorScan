import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { Influencer } from '../types';
import { creatorService } from '../services/api';
import ConfirmModal from '../components/ConfirmModal';

const InfluencerList: React.FC = () => {
  const [platform, setPlatform] = useState<'Instagram' | 'TikTok' | 'YouTube'>('Instagram');
  const [influencers, setInfluencers] = useState<Influencer[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  
  // Search & Filter
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [hasEmail, setHasEmail] = useState<string>('all');
  const [hasShareLink, setHasShareLink] = useState<string>('all');
  
  const [minFollowers, setMinFollowers] = useState<string>('');
  const [maxFollowers, setMaxFollowers] = useState<string>('');
  const [debouncedMinFollowers, setDebouncedMinFollowers] = useState<string>('');
  const [debouncedMaxFollowers, setDebouncedMaxFollowers] = useState<string>('');
  
  // Pagination
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [total, setTotal] = useState(0);
  
  const [modalOpen, setModalOpen] = useState(false);
  const [modalConfig, setModalConfig] = useState<{
    title: string;
    message: string;
    onConfirm: () => void;
  }>({ title: '', message: '', onConfirm: () => {} });

  const [uploading, setUploading] = useState(false);
  const [isFilterOpen, setIsFilterOpen] = useState(false);

  // Debounce search
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), 500);
    return () => clearTimeout(t);
  }, [search]);

  // Debounce followers
  useEffect(() => {
    const t = setTimeout(() => {
        setDebouncedMinFollowers(minFollowers);
        setDebouncedMaxFollowers(maxFollowers);
    }, 500);
    return () => clearTimeout(t);
  }, [minFollowers, maxFollowers]);

  // Reset page when filters change
  useEffect(() => {
    setPage(1);
  }, [platform, debouncedSearch, hasEmail, hasShareLink, debouncedMinFollowers, debouncedMaxFollowers, pageSize]);

  useEffect(() => {
    fetchInfluencers();
  }, [platform, debouncedSearch, hasEmail, hasShareLink, debouncedMinFollowers, debouncedMaxFollowers, page, pageSize]);

  // Reset selection when list reloads
  useEffect(() => {
    setSelectedIds(new Set());
  }, [influencers]);

  const fetchInfluencers = async () => {
    setLoading(true);
    try {
      const emailFilter = hasEmail === 'all' ? undefined : (hasEmail === 'yes');
      const shareLinkFilter = hasShareLink === 'all' ? undefined : (hasShareLink === 'yes');
      const minF = debouncedMinFollowers ? parseInt(debouncedMinFollowers) : undefined;
      const maxF = debouncedMaxFollowers ? parseInt(debouncedMaxFollowers) : undefined;

      const data = await creatorService.getAll(
        (page - 1) * pageSize,
        pageSize,
        debouncedSearch,
        emailFilter,
        platform,
        shareLinkFilter,
        minF,
        maxF
      );
      
      setTotal(data.total);
      
      const transformed = data.items.map((item: any) => ({
        id: item.id.toString(),
        name: item.data?.nickname || item.unique_id,
        handle: `@${item.unique_id}`,
        avatar: item.data?.avatar || item.data?.avatar_url || item.data?.avatarurl || 'https://picsum.photos/100/100',
        platform: item.platform,
        followers: item.data?.followerCount || '-',
        location: '未知', // Backend doesn't have location yet
        email: item.data?.email || '',
        shareLink: item.data?.ShareLinks || item.data?.shareLinks || item.data?.shareLink || item.data?.ShareLink || item.data?.share_link || '',
        status: item.email_status === 'sent' ? 'sent' : (item.has_replied ? 'replied' : 'none')
      }));
      
      setInfluencers(transformed);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleSelectAll = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.checked) {
      setSelectedIds(new Set(influencers.map(i => i.id)));
    } else {
      setSelectedIds(new Set());
    }
  };

  const handleSelectOne = (id: string, checked: boolean) => {
    const newSelected = new Set(selectedIds);
    if (checked) {
      newSelected.add(id);
    } else {
      newSelected.delete(id);
    }
    setSelectedIds(newSelected);
  };

  const handleBatchDelete = async () => {
    if (selectedIds.size === 0) return;
    
    setModalConfig({
      title: '确认批量删除',
      message: `确定要删除选中的 ${selectedIds.size} 位红人吗？此操作无法撤销，数据将被永久删除。`,
      onConfirm: async () => {
        try {
          await Promise.all(Array.from(selectedIds).map((id: string) => creatorService.delete(id)));
          fetchInfluencers(); // Refresh list from server
          setSelectedIds(new Set());
          setModalOpen(false);
        } catch (err: any) {
          console.error('Batch delete failed', err);
          alert('部分删除失败，请重试');
          fetchInfluencers();
          setModalOpen(false);
        }
      }
    });
    setModalOpen(true);
  };

  const handleImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      setUploading(true);
      try {
        await creatorService.importFromExcel(e.target.files[0]);
        alert('导入成功！');
        fetchInfluencers();
      } catch (err) {
        console.error('Import failed', err);
        alert('导入失败，请检查文件格式');
      } finally {
        setUploading(false);
        e.target.value = ''; 
      }
    }
  };

  const handleDelete = async (id: string) => {
    setModalConfig({
      title: '确认删除红人',
      message: '确定要删除这位红人吗？此操作无法撤销，相关数据将被永久移除。',
      onConfirm: async () => {
        try {
          await creatorService.delete(id);
          fetchInfluencers(); // Refresh list from server
          if (selectedIds.has(id)) {
            const newSelected = new Set(selectedIds);
            newSelected.delete(id);
            setSelectedIds(newSelected);
          }
          setModalOpen(false);
        } catch (err) {
          console.error('Delete failed', err);
          alert('删除失败');
          setModalOpen(false);
        }
      }
    });
    setModalOpen(true);
  };

  const totalPages = Math.ceil(total / pageSize);

  const activeFiltersCount = [
    hasEmail !== 'all',
    hasShareLink !== 'all',
    minFollowers !== '',
    maxFollowers !== ''
  ].filter(Boolean).length;

  const clearFilters = () => {
    setHasEmail('all');
    setHasShareLink('all');
    setMinFollowers('');
    setMaxFollowers('');
  };

  return (
    <div className="h-full flex flex-col bg-slate-50 dark:bg-[#101922] overflow-hidden">
      <div className="p-8 pb-4 shrink-0">
        <div className="flex items-end justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold text-slate-900 dark:text-white">网红列表管理</h1>
            <p className="text-sm text-slate-500 mt-1">管理并组织从浏览器插件同步的 KOL 资料。</p>
          </div>
          <div className="flex gap-2 p-1 bg-slate-200/50 dark:bg-slate-800 rounded-xl">
            {(['Instagram', 'TikTok', 'YouTube'] as const).map((p) => (
              <button 
                key={p}
                onClick={() => setPlatform(p)}
                className={`flex items-center gap-2 px-4 py-1.5 rounded-lg transition-all text-sm font-medium ${
                  platform === p 
                    ? 'bg-white dark:bg-slate-700 shadow-sm text-slate-900 dark:text-white' 
                    : 'text-slate-500 dark:text-slate-400 hover:bg-white/50'
                }`}
              >
                <span className={`material-symbols-outlined text-lg ${p === 'Instagram' ? 'text-pink-500' : p === 'YouTube' ? 'text-red-500' : 'text-slate-500'}`}>
                  {p === 'Instagram' ? 'photo_camera' : p === 'YouTube' ? 'play_circle' : 'videocam'}
                </span>
                {p}
              </button>
            ))}
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-4 py-3 border-y border-slate-200 dark:border-slate-800">
          <div className="flex flex-wrap items-center gap-3 flex-1">
             {selectedIds.size > 0 ? (
               <div className="flex items-center gap-3 w-full">
                 <span className="text-sm font-semibold text-slate-700 dark:text-slate-300">已选择 {selectedIds.size} 项</span>
                 <button 
                   onClick={handleBatchDelete}
                   className="text-red-500 hover:text-red-600 text-sm font-bold flex items-center gap-1 bg-red-50 dark:bg-red-900/20 px-3 py-1 rounded-lg transition-colors"
                 >
                   <span className="material-symbols-outlined text-sm">delete</span>
                   批量删除
                 </button>
                 <button 
                   onClick={() => setSelectedIds(new Set())}
                   className="text-slate-500 hover:text-slate-700 text-sm ml-auto"
                 >
                    取消选择
                 </button>
               </div>
             ) : (
               <>
                 {/* Search */}
                 <div className="relative flex-1 min-w-[200px] max-w-xs">
                   <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-lg">search</span>
                   <input 
                     type="text" 
                     placeholder="搜索用户名..." 
                     value={search}
                     onChange={(e) => setSearch(e.target.value)}
                     className="w-full pl-10 pr-4 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all"
                   />
                 </div>
                 
                 {/* Filter Button */}
                 <div className="relative">
                    <button 
                        onClick={() => setIsFilterOpen(!isFilterOpen)}
                        className={`flex items-center gap-2 px-3 py-1.5 rounded-lg border transition-all text-sm font-medium ${
                            isFilterOpen || activeFiltersCount > 0
                                ? 'bg-primary/10 border-primary text-primary'
                                : 'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-50'
                        }`}
                    >
                        <span className="material-symbols-outlined text-lg">filter_alt</span>
                        筛选
                        {activeFiltersCount > 0 && (
                            <span className="bg-primary text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full min-w-[18px] text-center">
                                {activeFiltersCount}
                            </span>
                        )}
                    </button>

                    {/* Filter Panel */}
                    {isFilterOpen && (
                        <>
                            <div className="fixed inset-0 z-20" onClick={() => setIsFilterOpen(false)}></div>
                            <div className="absolute top-full left-0 mt-2 w-72 bg-white dark:bg-slate-800 rounded-xl shadow-xl border border-slate-200 dark:border-slate-700 z-30 p-4 flex flex-col gap-4 animate-in fade-in zoom-in-95 duration-200">
                                <div className="flex items-center justify-between pb-2 border-b border-slate-100 dark:border-slate-700">
                                    <h3 className="font-semibold text-slate-900 dark:text-white">筛选条件</h3>
                                    {activeFiltersCount > 0 && (
                                        <button onClick={clearFilters} className="text-xs text-primary hover:text-primary/80 font-medium">
                                            清除筛选
                                        </button>
                                    )}
                                </div>
                                
                                <div className="space-y-3">
                                    <div className="space-y-1.5">
                                        <label className="text-xs font-medium text-slate-500">邮箱状态</label>
                                        <select 
                                            value={hasEmail} 
                                            onChange={(e) => setHasEmail(e.target.value)}
                                            className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900/50 text-sm focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all"
                                        >
                                            <option value="all">全部</option>
                                            <option value="yes">有邮箱</option>
                                            <option value="no">无邮箱</option>
                                        </select>
                                    </div>

                                    <div className="space-y-1.5">
                                        <label className="text-xs font-medium text-slate-500">ShareLink 状态</label>
                                        <select 
                                            value={hasShareLink} 
                                            onChange={(e) => setHasShareLink(e.target.value)}
                                            className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900/50 text-sm focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all"
                                        >
                                            <option value="all">全部</option>
                                            <option value="yes">有链接</option>
                                            <option value="no">无链接</option>
                                        </select>
                                    </div>

                                    <div className="space-y-1.5">
                                        <label className="text-xs font-medium text-slate-500">粉丝量范围</label>
                                        <div className="flex items-center gap-2">
                                            <input 
                                                type="number" 
                                                placeholder="最小值" 
                                                value={minFollowers}
                                                onChange={(e) => setMinFollowers(e.target.value)}
                                                className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900/50 text-sm focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all"
                                            />
                                            <span className="text-slate-400">-</span>
                                            <input 
                                                type="number" 
                                                placeholder="最大值" 
                                                value={maxFollowers}
                                                onChange={(e) => setMaxFollowers(e.target.value)}
                                                className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900/50 text-sm focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all"
                                            />
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </>
                    )}
                 </div>

                 <div className="h-6 w-px bg-slate-200 dark:bg-slate-700 mx-1"></div>

                 <button onClick={() => fetchInfluencers()} className="text-primary text-sm font-semibold whitespace-nowrap hover:opacity-80 flex items-center gap-1">
                    <span className="material-symbols-outlined text-lg">refresh</span>
                    刷新
                 </button>
                 <label className="text-primary text-sm font-semibold cursor-pointer flex items-center gap-1 whitespace-nowrap hover:opacity-80">
                    <span className="material-symbols-outlined text-lg">upload_file</span>
                    {uploading ? '导入中...' : '导入Excel'}
                    <input type="file" accept=".xlsx, .xls, .csv" className="hidden" onChange={handleImport} disabled={uploading} />
                 </label>
               </>
             )}
          </div>
          <div className="flex items-center gap-3">
            <button className="bg-primary text-white px-4 py-2 rounded-lg text-sm font-bold flex items-center gap-2 hover:bg-primary/90 transition-colors shadow-sm shadow-primary/30">
              <span className="material-symbols-outlined text-lg">mail</span>
              批量发送邮件
            </button>
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-auto px-8 pb-4">
        {loading ? (
            <div className="text-center p-10 text-slate-500">加载中...</div>
        ) : (
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden shadow-sm flex flex-col h-full">
          <div className="flex-1 overflow-auto">
          <table className="w-full text-left border-collapse min-w-[1000px]">
            <thead className="bg-slate-50 dark:bg-slate-800/50 sticky top-0 z-10">
              <tr>
                <th className="py-3 px-4 w-12 bg-slate-50 dark:bg-slate-800/50">
                  <input 
                    className="rounded border-slate-300 text-primary focus:ring-primary cursor-pointer" 
                    type="checkbox"
                    checked={influencers.length > 0 && selectedIds.size === influencers.length}
                    onChange={handleSelectAll}
                  />
                </th>
                <th className="py-3 px-4 text-xs font-semibold text-slate-500 uppercase tracking-wider bg-slate-50 dark:bg-slate-800/50">用户名</th>
                <th className="py-3 px-4 text-xs font-semibold text-slate-500 uppercase tracking-wider bg-slate-50 dark:bg-slate-800/50">粉丝数</th>
                <th className="py-3 px-4 text-xs font-semibold text-slate-500 uppercase tracking-wider bg-slate-50 dark:bg-slate-800/50">地区</th>
                <th className="py-3 px-4 text-xs font-semibold text-slate-500 uppercase tracking-wider bg-slate-50 dark:bg-slate-800/50">邮箱</th>
                <th className="py-3 px-4 text-xs font-semibold text-slate-500 uppercase tracking-wider bg-slate-50 dark:bg-slate-800/50">ShareLink</th>
                <th className="py-3 px-4 text-xs font-semibold text-slate-500 uppercase tracking-wider bg-slate-50 dark:bg-slate-800/50">状态</th>
                <th className="py-3 px-4 text-right bg-slate-50 dark:bg-slate-800/50"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {influencers.length === 0 && (
                  <tr><td colSpan={8} className="p-8 text-center text-slate-500">暂无数据</td></tr>
              )}
              {influencers.map((inf) => (
                <tr key={inf.id} className={`hover:bg-slate-50 dark:hover:bg-slate-800/30 transition-colors group ${selectedIds.has(inf.id) ? 'bg-blue-50/50 dark:bg-blue-900/10' : ''}`}>
                  <td className="py-3 px-4">
                    <input 
                      className="rounded border-slate-300 text-primary focus:ring-primary cursor-pointer" 
                      type="checkbox"
                      checked={selectedIds.has(inf.id)}
                      onChange={(e) => handleSelectOne(inf.id, e.target.checked)}
                    />
                  </td>
                  <td className="py-3 px-4">
                    <Link to={`/details/${inf.id}`} className="flex items-center gap-3 hover:opacity-80 transition-opacity">
                      <div className="relative">
                        <div className="size-9 rounded-full bg-slate-200 bg-cover bg-center" style={{ backgroundImage: `url(${inf.avatar})` }}></div>
                      </div>
                      <div>
                        <p className="text-sm font-semibold text-slate-900 dark:text-white">{inf.handle}</p>
                        <p className="text-xs text-slate-500">{inf.name}</p>
                      </div>
                    </Link>
                  </td>
                  <td className="py-3 px-4">
                    <p className="text-sm font-medium text-slate-700 dark:text-slate-300">{inf.followers}</p>
                  </td>
                  <td className="py-3 px-4">
                    <div className="flex items-center gap-1.5 text-sm text-slate-600 dark:text-slate-400">
                      <span className="material-symbols-outlined text-base">location_on</span>
                      {inf.location}
                    </div>
                  </td>
                  <td className="py-3 px-4">
                    <div className="flex items-center gap-1.5">
                      <p className={`text-sm ${inf.email ? 'text-slate-600 dark:text-slate-400' : 'text-slate-400 dark:text-slate-500 italic'}`}>
                        {inf.email || '未找到邮箱'}
                      </p>
                      {inf.email && <span className="material-symbols-outlined text-green-500 text-sm">verified</span>}
                    </div>
                  </td>
                  <td className="py-3 px-4">
                    {inf.shareLink ? (
                        <a href={inf.shareLink} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline text-sm truncate max-w-[150px] block" title={inf.shareLink}>
                            查看链接
                        </a>
                    ) : (
                        <span className="text-slate-400 text-sm">-</span>
                    )}
                  </td>
                  <td className="py-3 px-4">
                    {inf.status !== 'none' && (
                      <span className={`px-2 py-1 rounded-full text-[11px] font-bold border uppercase ${
                        inf.status === 'sent' ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400 border-blue-200' :
                        inf.status === 'replied' ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400 border-green-200' :
                        'bg-slate-100 text-slate-600 dark:bg-slate-800 border-slate-200'
                      }`}>
                        {inf.status === 'sent' ? '已发送' : inf.status === 'replied' ? '已回复' : '洽谈中'}
                      </span>
                    )}
                    {inf.status === 'none' && (
                      <span className="px-2 py-1 rounded-full text-[11px] font-bold bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400 border border-slate-200 dark:border-slate-700 uppercase">
                        未联系
                      </span>
                    )}
                  </td>
                  <td className="py-3 px-4 text-right">
                    <button 
                        onClick={() => handleDelete(inf.id)}
                        className="p-1.5 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-md transition-all text-slate-400 hover:text-red-500"
                        title="删除"
                    >
                      <span className="material-symbols-outlined text-lg">delete</span>
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>
          
          {/* Pagination */}
          <div className="border-t border-slate-200 dark:border-slate-800 p-4 flex items-center justify-between bg-slate-50 dark:bg-slate-800/50">
            <div className="flex items-center gap-4 text-sm text-slate-500">
                <span>共 {total} 条数据</span>
                <div className="flex items-center gap-2">
                  <span>每页显示</span>
                  <select 
                    value={pageSize}
                    onChange={(e) => setPageSize(Number(e.target.value))}
                    className="px-2 py-1 rounded border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 text-sm focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none transition-all"
                  >
                    <option value={10}>10</option>
                    <option value={20}>20</option>
                    <option value={50}>50</option>
                    <option value={100}>100</option>
                  </select>
                  <span>条</span>
                </div>
            </div>
            <div className="flex gap-2">
                <button 
                    disabled={page === 1}
                    onClick={() => setPage(p => Math.max(1, p - 1))}
                    className="px-3 py-1 rounded border border-slate-300 dark:border-slate-600 disabled:opacity-50 text-sm hover:bg-white dark:hover:bg-slate-700 transition-colors"
                >
                    上一页
                </button>
                <span className="px-3 py-1 text-sm text-slate-600 dark:text-slate-400 flex items-center">
                    第 {page} / {totalPages || 1} 页
                </span>
                <button 
                    disabled={page >= totalPages}
                    onClick={() => setPage(p => p + 1)}
                    className="px-3 py-1 rounded border border-slate-300 dark:border-slate-600 disabled:opacity-50 text-sm hover:bg-white dark:hover:bg-slate-700 transition-colors"
                >
                    下一页
                </button>
            </div>
          </div>
        </div>
        )}
      </div>

      <ConfirmModal
        isOpen={modalOpen}
        onClose={() => setModalOpen(false)}
        onConfirm={modalConfig.onConfirm}
        title={modalConfig.title}
        message={modalConfig.message}
      />
    </div>
  );
};

export default InfluencerList;