
import React, { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { creatorService } from '../services/api';
import { useFeedback } from '../components/FeedbackProvider';

type ContactStatus = 'none' | 'pending' | 'sent' | 'replied';

const InfluencerDetail: React.FC = () => {
  const { notify } = useFeedback();
  const { id } = useParams<{ id: string }>();
  const [creator, setCreator] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [updatingStatus, setUpdatingStatus] = useState(false);
  const [shareMessage, setShareMessage] = useState<string | null>(null);
  const [moreOpen, setMoreOpen] = useState(false);

  const getContactStatus = (item: any): ContactStatus => {
    if (item?.has_replied) return 'replied';
    if (item?.email_status === 'sent') return 'sent';
    if (item?.manual_status === 'pending') return 'pending';
    return 'none';
  };

  const getStatusMeta = (status: ContactStatus) => {
    if (status === 'replied') return { label: '已回复', desc: '该红人已回复您的邮件', className: 'bg-emerald-100 text-emerald-600' };
    if (status === 'sent') return { label: '已联系', desc: '已发送邮件，等待对方回复', className: 'bg-blue-100 text-blue-600' };
    if (status === 'pending') return { label: '跟进中', desc: '已加入手动跟进队列', className: 'bg-amber-100 text-amber-700' };
    return { label: '待联系', desc: '尚未建立有效沟通', className: 'bg-slate-100 text-slate-600' };
  };

  const handleUpdateStatus = async (status: 'none' | 'pending') => {
    if (!id) return;
    try {
      setUpdatingStatus(true);
      const updated = await creatorService.updateStatus(id, status);
      setCreator(updated);
    } catch (err: any) {
      console.error('Failed to update status:', err);
      notify(err?.response?.data?.detail || '更新状态失败', 'error');
    } finally {
      setUpdatingStatus(false);
    }
  };

  useEffect(() => {
    const fetchCreator = async () => {
      if (!id) return;
      try {
        setLoading(true);
        const data = await creatorService.getById(id);
        setCreator(data);
      } catch (err: any) {
        console.error('Failed to fetch creator:', err);
        setError(err.message || '获取红人详情失败');
      } finally {
        setLoading(false);
      }
    };

    fetchCreator();
  }, [id]);

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
      </div>
    );
  }

  if (error || !creator) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center gap-4">
        <div className="text-slate-500">{error || '未找到红人信息'}</div>
        <Link to="/influencers" className="text-primary hover:underline font-bold">返回列表</Link>
      </div>
    );
  }

  const data = creator.data || {};
  const nickname = data.nickname || data.name || `@${creator.unique_id}`;
  const avatar = data.avatar || `https://picsum.photos/200/200?seed=${creator.unique_id}`;
  const followers = data.followerCount || data.followers || '未知';
  const bio = data.signature || data.bio || '暂无简介';
  const location = data.location || '未知';
  const platform = creator.platform;
  const statusMeta = getStatusMeta(getContactStatus(creator));
  const profileLink = data.shareLink || data.ShareLink || data.profileUrl || data.profile_url || '';

  const handleShare = async () => {
    const detailUrl = window.location.href;
    try {
      await navigator.clipboard.writeText(detailUrl);
      setShareMessage('详情链接已复制');
    } catch {
      setShareMessage('复制失败，请手动复制地址栏链接');
    } finally {
      window.setTimeout(() => setShareMessage(null), 2500);
    }
  };

  const handleOpenProfile = () => {
    if (!profileLink) {
      setShareMessage('未找到可打开的主页链接');
      window.setTimeout(() => setShareMessage(null), 2500);
      return;
    }
    window.open(profileLink, '_blank', 'noopener,noreferrer');
    setMoreOpen(false);
  };

  return (
    <div className="flex-1 overflow-y-auto h-full w-full">
      <div className="max-w-[1400px] mx-auto px-6 py-8">
        <div className="flex flex-col lg:flex-row gap-8 items-start">
        <aside className="w-full lg:w-80 flex flex-col gap-6 lg:sticky lg:top-24">
          <div className="bg-white dark:bg-slate-900 rounded-xl p-6 shadow-sm border border-slate-200 dark:border-slate-800">
            <div className="flex flex-col items-center text-center">
              <div className="relative mb-4">
                <div 
                  className="size-28 rounded-full border-4 border-slate-50 dark:border-slate-800 shadow-lg overflow-hidden bg-cover bg-center" 
                  style={{ backgroundImage: `url('${avatar}')` }}
                ></div>
                <div className="absolute bottom-1 right-1 bg-primary text-white p-1 rounded-full border-2 border-white dark:border-slate-900 flex items-center justify-center">
                  <span className="material-symbols-outlined text-[14px]">verified</span>
                </div>
              </div>
              <h1 className="text-xl font-bold text-slate-900 dark:text-white">{nickname}</h1>
              <p className="text-slate-500 text-sm mb-4">{bio}</p>
              <div className="flex gap-2 mb-6">
                <span className="px-3 py-1 bg-slate-100 dark:bg-slate-800 text-xs font-semibold rounded-full text-slate-700 dark:text-slate-300">{platform}</span>
                {data.category && <span className="px-3 py-1 bg-slate-100 dark:bg-slate-800 text-xs font-semibold rounded-full text-slate-700 dark:text-slate-300">{data.category}</span>}
              </div>
              <div className="w-full space-y-3 pt-4 border-t border-slate-100 dark:border-slate-800">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 text-slate-500 text-sm">
                    <span className="material-symbols-outlined text-sm">location_on</span>
                    <span>地区</span>
                  </div>
                  <span className="text-sm font-medium text-slate-700 dark:text-slate-300">{location}</span>
                </div>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 text-slate-500 text-sm">
                    <span className="material-symbols-outlined text-sm">group</span>
                    <span>粉丝数</span>
                  </div>
                  <span className="text-sm font-medium text-slate-700 dark:text-slate-300">{followers}</span>
                </div>
                {data.engagement_rate && (
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 text-slate-500 text-sm">
                      <span className="material-symbols-outlined text-sm">bolt</span>
                      <span>互动率</span>
                    </div>
                    <span className="text-sm font-medium text-emerald-500">{data.engagement_rate}</span>
                  </div>
                )}
              </div>
            </div>
          </div>

          <div className="bg-white dark:bg-slate-900 rounded-xl p-4 shadow-sm border border-slate-200 dark:border-slate-800 grid grid-cols-2 gap-4">
            <div className="flex flex-col items-center p-3 bg-slate-50 dark:bg-slate-800/50 rounded-lg">
              <span className="text-lg font-bold text-slate-900 dark:text-white">{data.avg_views || '-'}</span>
              <span className="text-[10px] uppercase tracking-wider text-slate-500">平均观看</span>
            </div>
            <div className="flex flex-col items-center p-3 bg-slate-50 dark:bg-slate-800/50 rounded-lg">
              <span className="text-lg font-bold text-slate-900 dark:text-white">{data.ctr || '-'}</span>
              <span className="text-[10px] uppercase tracking-wider text-slate-500">点击率</span>
            </div>
            <div className="col-span-2 flex items-center justify-center gap-2 py-1 text-xs text-slate-400">
              <span className="material-symbols-outlined text-xs">sync</span>
              最后同步: {new Date(creator.created_at).toLocaleString()}
            </div>
          </div>

          <div className="flex flex-col gap-3">
            <Link 
              to={`/marketing?creator=${creator.id}`}
              className="w-full bg-primary hover:bg-primary/90 text-white font-bold py-2.5 rounded-lg flex items-center justify-center gap-2 transition-all shadow-md shadow-primary/20"
            >
              <span className="material-symbols-outlined text-sm">mail</span>
              立即联系
            </Link>
            <button
              onClick={() => handleUpdateStatus('pending')}
              disabled={updatingStatus}
              className="w-full bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 disabled:opacity-60 disabled:cursor-not-allowed dark:hover:bg-slate-700 text-slate-900 dark:text-white font-bold py-2.5 rounded-lg flex items-center justify-center gap-2 transition-all"
            >
              <span className="material-symbols-outlined text-sm">sync_alt</span>
              标记跟进中
            </button>
            <button
              onClick={() => handleUpdateStatus('none')}
              disabled={updatingStatus}
              className="w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 hover:bg-slate-50 disabled:opacity-60 disabled:cursor-not-allowed text-slate-700 dark:text-slate-200 font-bold py-2.5 rounded-lg flex items-center justify-center gap-2 transition-all"
            >
              <span className="material-symbols-outlined text-sm">remove_done</span>
              清除手动状态
            </button>
          </div>
        </aside>

        <div className="flex-1 flex flex-col gap-8 w-full">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className={`px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wide ${statusMeta.className}`}>{statusMeta.label}</div>
              <div className="text-xs text-slate-500">
                {statusMeta.desc}
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={handleShare}
                className="p-2 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg text-slate-500"
                title="复制详情链接"
              >
                <span className="material-symbols-outlined">share</span>
              </button>
              <div className="relative">
                <button
                  onClick={() => setMoreOpen((v) => !v)}
                  className="p-2 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg text-slate-500"
                  title="更多操作"
                >
                  <span className="material-symbols-outlined">more_horiz</span>
                </button>
                {moreOpen && (
                  <div className="absolute right-0 mt-2 w-48 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 shadow-lg z-10">
                    <button
                      onClick={handleOpenProfile}
                      className="w-full text-left px-3 py-2 text-sm text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800"
                    >
                      打开红人主页
                    </button>
                    <button
                      onClick={() => {
                        setMoreOpen(false);
                        handleShare();
                      }}
                      className="w-full text-left px-3 py-2 text-sm text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800"
                    >
                      复制详情链接
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>
          {shareMessage && <div className="text-xs text-slate-500 -mt-6">{shareMessage}</div>}

          <section className="bg-white dark:bg-slate-900 rounded-xl shadow-sm border border-slate-200 dark:border-slate-800 overflow-hidden">
            <div className="p-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
              <h3 className="font-bold flex items-center gap-2 text-slate-900 dark:text-white">
                <span className="material-symbols-outlined text-primary">history</span>
                活动日志与来源
              </h3>
            </div>
            <div className="p-6">
              <div className="relative space-y-6 before:absolute before:inset-0 before:ml-5 before:-translate-x-px before:h-full before:w-0.5 before:bg-gradient-to-b before:from-slate-200 before:via-slate-200 before:to-transparent dark:before:from-slate-800 dark:before:via-slate-800">
                <div className="relative flex items-start gap-6">
                  <div className="absolute left-0 flex h-10 w-10 items-center justify-center rounded-full bg-white dark:bg-slate-900 border-2 border-primary shadow-sm ring-4 ring-white dark:ring-slate-900">
                    <span className="material-symbols-outlined text-primary text-sm">extension</span>
                  </div>
                  <div className="ml-10 pt-1.5">
                    <p className="text-sm font-semibold text-slate-900 dark:text-white">系统录入</p>
                    <p className="text-xs text-slate-500">来源: {data.source || '批量导入'} • {new Date(creator.created_at).toLocaleString()}</p>
                  </div>
                </div>
              </div>
            </div>
          </section>

          {creator.latest_reply_content && (
            <section className="bg-white dark:bg-slate-900 rounded-xl shadow-sm border border-slate-200 dark:border-slate-800 overflow-hidden">
              <div className="p-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
                <h3 className="font-bold flex items-center gap-2 text-slate-900 dark:text-white">
                  <span className="material-symbols-outlined text-primary">email</span>
                  最新回复内容
                </h3>
              </div>
              <div className="p-5">
                <div className="p-4 bg-slate-50 dark:bg-slate-800/30 rounded-lg border border-slate-200 dark:border-slate-700 shadow-sm text-sm">
                  <p className="text-slate-700 dark:text-slate-300 whitespace-pre-wrap">{creator.latest_reply_content}</p>
                </div>
                <div className="mt-4">
                  <Link 
                    to={`/marketing?creator=${creator.id}`}
                    className="text-xs font-bold text-primary flex items-center gap-1 hover:underline"
                  >
                    <span className="material-symbols-outlined text-xs">reply</span>
                    前往回复
                  </Link>
                </div>
              </div>
            </section>
          )}

          <section className="bg-white dark:bg-slate-900 rounded-xl shadow-sm border border-slate-200 dark:border-slate-800 overflow-hidden">
            <div className="p-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
              <h3 className="font-bold flex items-center gap-2 text-slate-900 dark:text-white">
                <span className="material-symbols-outlined text-primary">edit_note</span>
                红人详细数据
              </h3>
            </div>
            <div className="p-4 overflow-x-auto">
              <table className="w-full text-sm text-left">
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {Object.entries(data).map(([key, value]) => (
                    <tr key={key} className="hover:bg-slate-50 dark:hover:bg-slate-800/50">
                      <td className="py-3 pr-4 font-medium text-slate-500 w-1/3">{key}</td>
                      <td className="py-3 text-slate-900 dark:text-white">
                        {typeof value === 'object' ? JSON.stringify(value) : String(value)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </div>
      </div>
    </div>
    </div>
  );
};

export default InfluencerDetail;
