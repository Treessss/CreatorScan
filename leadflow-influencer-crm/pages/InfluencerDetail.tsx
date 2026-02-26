import React, { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { creatorService, toApiAssetUrl } from '../services/api';
import { useFeedback } from '../components/FeedbackProvider';

type ContactStatus = 'none' | 'pending' | 'sent' | 'replied';

const FIELD_LABELS_ZH: Record<string, string> = {
  id: '记录ID',
  platform: '平台',
  unique_id: '账号ID',
  uniqueId: '账号ID',
  userId: '用户名',
  authorId: '作者ID',
  secUid: '安全标识',
  nickname: '昵称',
  name: '名称',
  avatar: '头像链接',
  avatar_url: '头像链接',
  avatarurl: '头像链接',
  avatar_source_url: '头像原始链接',
  avatarLocal: '本地头像缓存',
  avatarLocalSourceUrl: '本地头像来源',
  followerCount: '粉丝数',
  followers: '粉丝数',
  followingCount: '关注数',
  heartCount: '获赞数',
  videoCount: '视频数',
  email: '邮箱',
  email_status: '邮件状态',
  emailSourceUrl: '邮箱来源链接',
  has_replied: '是否已回复',
  latest_reply_content: '最新回复内容',
  manual_status: '手动状态',
  signature: '简介',
  bio: '简介',
  category: '分类',
  shareLinks: '外部链接',
  ShareLinks: '外部链接',
  shareLink: '外部链接',
  ShareLink: '外部链接',
  share_link: '外部链接',
  profileUrl: '主页链接',
  profile_url: '主页链接',
  url: '主页链接',
  videoUrl: '视频链接',
  location: '地区',
  locationCreated: '账号归属地',
  region: '地区代码',
  country: '国家/地区',
  tags: '标签',
  verified: '认证状态',
  source: '来源',
  timestamp: '采集时间',
  created_at: '创建时间',
  updated_at: '更新时间',
  taskHydrationStatus: '自动补全状态',
  taskHydrationError: '自动补全错误',
  taskHydratedAt: '自动补全时间',
  deepScraped: '深度挖掘',
  deepScrapedAt: '深度挖掘时间',
  avg_views: '平均观看',
  ctr: '点击率',
  engagement_rate: '互动率',
};

const FIELD_ALIAS_GROUPS: string[][] = [
  ['uniqueId', 'unique_id', 'userId'],
  ['nickname', 'name'],
  ['avatar', 'avatar_url', 'avatarurl'],
  ['profileUrl', 'profile_url', 'url'],
  ['shareLinks', 'ShareLinks', 'shareLink', 'ShareLink', 'share_link'],
  ['followerCount', 'followers'],
  ['signature', 'bio'],
  ['location', 'locationCreated', 'region', 'country'],
  ['tags', 'Tags', 'labels', 'Labels', 'label', 'Label'],
];

const FIELD_ORDER = [
  'platform',
  'uniqueId',
  'nickname',
  'category',
  'verified',
  'location',
  'followerCount',
  'followingCount',
  'heartCount',
  'videoCount',
  'email',
  'shareLinks',
  'tags',
  'profileUrl',
  'videoUrl',
  'signature',
  'source',
  'timestamp',
  'taskHydrationStatus',
  'taskHydratedAt',
  'taskHydrationError',
  'created_at',
  'email_status',
  'manual_status',
  'has_replied',
];

const COMMON_DETAIL_KEYS = new Set([
  'platform',
  'uniqueId',
  'nickname',
  'category',
  'verified',
  'location',
  'followerCount',
  'followingCount',
  'heartCount',
  'videoCount',
  'email',
  'shareLinks',
  'tags',
  'profileUrl',
  'videoUrl',
  'signature',
  'source',
  'timestamp',
  'taskHydrationStatus',
  'created_at',
]);

const STATUS_VALUE_ZH: Record<string, string> = {
  sent: '已发送',
  failed: '失败',
  pending: '待处理',
  replied: '已回复',
  none: '无',
  success: '成功',
};

function normalizeTagList(value: unknown): string[] {
  if (Array.isArray(value)) return value.map((v) => String(v).trim()).filter(Boolean);
  if (typeof value === 'string') return value.split(/[\n,，;；]+/).map((v) => v.trim()).filter(Boolean);
  return [];
}

function isEmptyDisplayValue(value: unknown): boolean {
  if (value === null || value === undefined) return true;
  if (typeof value === 'string') return value.trim() === '';
  if (Array.isArray(value)) return value.length === 0;
  return false;
}

function formatTimestampLike(value: unknown): string | null {
  if (typeof value === 'number' && Number.isFinite(value)) {
    const asDate = new Date(value > 1e12 ? value : value * 1000);
    if (!Number.isNaN(asDate.getTime())) return asDate.toLocaleString();
  }
  if (typeof value === 'string') {
    const asNum = Number(value);
    if (Number.isFinite(asNum) && value.trim().length >= 10 && value.trim().length <= 16) {
      const asDate = new Date(asNum > 1e12 ? asNum : asNum * 1000);
      if (!Number.isNaN(asDate.getTime())) return asDate.toLocaleString();
    }
    const asDate = new Date(value);
    if (!Number.isNaN(asDate.getTime()) && /(\d{4}-\d{2}-\d{2}|T)/.test(value)) return asDate.toLocaleString();
  }
  return null;
}

function getFieldLabelZh(key: string): string {
  return FIELD_LABELS_ZH[key] || `自定义字段（${key}）`;
}

function canonicalizeDetailData(source: Record<string, any>) {
  const raw = source || {};
  const consumed = new Set<string>();
  const rows: Array<{ key: string; rawKeys: string[]; value: any }> = [];

  FIELD_ALIAS_GROUPS.forEach((group) => {
    const presentKeys = group.filter((k) => Object.prototype.hasOwnProperty.call(raw, k));
    if (presentKeys.length === 0) return;
    let chosenKey = presentKeys[0];
    let chosenValue = raw[chosenKey];
    for (const k of presentKeys) {
      const v = raw[k];
      if (!isEmptyDisplayValue(v)) {
        chosenKey = group[0];
        chosenValue = v;
        break;
      }
    }
    presentKeys.forEach((k) => consumed.add(k));
    if (!isEmptyDisplayValue(chosenValue)) {
      rows.push({ key: chosenKey, rawKeys: presentKeys, value: chosenValue });
    }
  });

  Object.entries(raw).forEach(([key, value]) => {
    if (consumed.has(key)) return;
    if (isEmptyDisplayValue(value)) return;
    rows.push({ key, rawKeys: [key], value });
  });

  const orderIndex = new Map(FIELD_ORDER.map((k, i) => [k, i]));
  rows.sort((a, b) => {
    const ai = orderIndex.has(a.key) ? orderIndex.get(a.key)! : Number.MAX_SAFE_INTEGER;
    const bi = orderIndex.has(b.key) ? orderIndex.get(b.key)! : Number.MAX_SAFE_INTEGER;
    if (ai !== bi) return ai - bi;
    return getFieldLabelZh(a.key).localeCompare(getFieldLabelZh(b.key), 'zh-Hans-CN');
  });

  return rows;
}

function renderDetailValue(key: string, value: any): React.ReactNode {
  if (value === null || value === undefined || value === '') return '-';

  if (key === 'avatarLocal' && typeof value === 'string') {
    return <span className="text-emerald-600 font-medium">已缓存（本地）</span>;
  }

  if (typeof value === 'boolean') {
    return value ? '是' : '否';
  }

  if (typeof value === 'number') {
    const dt = formatTimestampLike(value);
    return dt && (String(key).toLowerCase().includes('time') || key.endsWith('_at')) ? dt : String(value);
  }

  if (typeof value === 'string') {
    const text = value.trim();
    if (!text) return '-';
    const dt = formatTimestampLike(text);
    if (dt && (key === 'timestamp' || key.endsWith('_at') || key.toLowerCase().includes('time') || key.endsWith('At'))) {
      return dt;
    }
    if (key.toLowerCase().includes('status') && STATUS_VALUE_ZH[text]) {
      return STATUS_VALUE_ZH[text];
    }
    if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(text)) {
      return <a href={`mailto:${text}`} className="text-primary hover:underline">{text}</a>;
    }
    if (/^https?:\/\//i.test(text)) {
      return (
        <a href={text} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline break-all">
          {text}
        </a>
      );
    }
    return text;
  }

  if (Array.isArray(value)) {
    if (key === 'tags') {
      const tags = normalizeTagList(value);
      if (tags.length === 0) return '-';
      return (
        <div className="flex flex-wrap gap-2">
          {tags.map((tag) => (
            <span key={tag} className="px-2 py-1 rounded-full text-xs font-semibold bg-primary/10 text-primary border border-primary/20">
              {tag}
            </span>
          ))}
        </div>
      );
    }
    return (
      <div className="space-y-1">
        {value.map((item, idx) => {
          const text = typeof item === 'string' ? item : JSON.stringify(item);
          if (typeof text === 'string' && /^https?:\/\//i.test(text)) {
            return (
              <a key={`${key}-${idx}`} href={text} target="_blank" rel="noopener noreferrer" className="block text-primary hover:underline break-all">
                {text}
              </a>
            );
          }
          return <div key={`${key}-${idx}`} className="break-all">{String(text)}</div>;
        })}
      </div>
    );
  }

  if (typeof value === 'object') {
    return (
      <pre className="whitespace-pre-wrap break-all text-xs bg-slate-50 dark:bg-slate-800/60 p-2 rounded-md border border-slate-100 dark:border-slate-700">
        {JSON.stringify(value, null, 2)}
      </pre>
    );
  }

  return String(value);
}

const InfluencerDetail: React.FC = () => {
  const { notify } = useFeedback();
  const { id } = useParams<{ id: string }>();
  const [creator, setCreator] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [updatingStatus, setUpdatingStatus] = useState(false);
  const [shareMessage, setShareMessage] = useState<string | null>(null);
  const [moreOpen, setMoreOpen] = useState(false);
  const [showMoreFields, setShowMoreFields] = useState(false);
  const [tagModalOpen, setTagModalOpen] = useState(false);
  const [tagInput, setTagInput] = useState('');
  const [savingTags, setSavingTags] = useState(false);

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
  const avatar = toApiAssetUrl(data.avatar || data.avatar_url || data.avatarurl) || `https://picsum.photos/200/200?seed=${creator.unique_id}`;
  const followers = data.followerCount || data.followers || '未知';
  const bio = data.signature || data.bio || '暂无简介';
  const location = data.location || data.locationCreated || data.region || data.country || '未知';
  const tags = normalizeTagList(data.tags || data.Tags || data.labels || data.label);
  const platform = creator.platform;
  const statusMeta = getStatusMeta(getContactStatus(creator));
  const profileLink = data.shareLink || data.ShareLink || data.profileUrl || data.profile_url || data.url || '';
  const detailRows = canonicalizeDetailData({
    platform: creator.platform,
    unique_id: creator.unique_id,
    created_at: creator.created_at,
    email_status: creator.email_status,
    manual_status: creator.manual_status,
    has_replied: creator.has_replied,
    ...data,
  });
  const commonDetailRows = detailRows.filter((row) => COMMON_DETAIL_KEYS.has(row.key));
  const extraDetailRows = detailRows.filter((row) => !COMMON_DETAIL_KEYS.has(row.key));

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

  const handleOpenTagModal = () => {
    setTagInput('');
    setTagModalOpen(true);
  };

  const handleAddTags = async () => {
    if (!id) return;
    const nextTags = normalizeTagList(tagInput);
    if (nextTags.length === 0) {
      notify('请输入至少一个标签', 'warning');
      return;
    }
    try {
      setSavingTags(true);
      const updated = await creatorService.updateTags(id, nextTags, 'merge');
      setCreator(updated);
      setTagModalOpen(false);
      setTagInput('');
      notify('标签已添加', 'success');
    } catch (err: any) {
      console.error('Failed to update tags:', err);
      notify(err?.response?.data?.detail || '添加标签失败', 'error');
    } finally {
      setSavingTags(false);
    }
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
              {tags.length > 0 && (
                <div className="w-full flex flex-wrap justify-center gap-2 mb-5">
                  {tags.map((tag) => (
                    <span
                      key={tag}
                      className="px-2.5 py-1 rounded-full text-xs font-semibold bg-primary/10 text-primary border border-primary/20"
                    >
                      {tag}
                    </span>
                  ))}
                </div>
              )}
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

          <div className="flex flex-col gap-3">
            <button
              onClick={handleOpenTagModal}
              className="w-full bg-primary/10 hover:bg-primary/15 text-primary font-bold py-2.5 rounded-lg flex items-center justify-center gap-2 transition-all border border-primary/20"
            >
              <span className="material-symbols-outlined text-sm">sell</span>
              添加标签
            </button>
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
                <thead>
                  <tr className="text-xs text-slate-500">
                    <th className="py-2 pr-4 font-semibold">字段名称</th>
                    <th className="py-2 font-semibold">字段值</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {commonDetailRows.map((row) => (
                    <tr key={`${row.key}-${row.rawKeys.join('-')}`} className="hover:bg-slate-50 dark:hover:bg-slate-800/50 align-top">
                      <td className="py-3 pr-4 font-medium text-slate-500 w-1/3">
                        <div className="flex flex-col">
                          <span>{getFieldLabelZh(row.key)}</span>
                          <span className="text-[11px] text-slate-400 font-normal">{row.rawKeys.join(' / ')}</span>
                        </div>
                      </td>
                      <td className="py-3 text-slate-900 dark:text-white">
                        {renderDetailValue(row.key, row.value)}
                      </td>
                    </tr>
                  ))}
                  {extraDetailRows.length > 0 && (
                    <tr>
                      <td colSpan={2} className="py-3">
                        <button
                          type="button"
                          onClick={() => setShowMoreFields((v) => !v)}
                          className="inline-flex items-center gap-1 text-sm font-semibold text-primary hover:text-primary/80"
                        >
                          <span className="material-symbols-outlined text-base">
                            {showMoreFields ? 'expand_less' : 'expand_more'}
                          </span>
                          {showMoreFields ? '收起更多字段' : `查看更多字段（${extraDetailRows.length}）`}
                        </button>
                      </td>
                    </tr>
                  )}
                  {showMoreFields && extraDetailRows.map((row) => (
                    <tr key={`${row.key}-${row.rawKeys.join('-')}`} className="hover:bg-slate-50 dark:hover:bg-slate-800/50 align-top">
                      <td className="py-3 pr-4 font-medium text-slate-500 w-1/3">
                        <div className="flex flex-col">
                          <span>{getFieldLabelZh(row.key)}</span>
                          <span className="text-[11px] text-slate-400 font-normal">{row.rawKeys.join(' / ')}</span>
                        </div>
                      </td>
                      <td className="py-3 text-slate-900 dark:text-white">
                        {renderDetailValue(row.key, row.value)}
                      </td>
                    </tr>
                  ))}
                  {commonDetailRows.length === 0 && (
                    <tr>
                      <td colSpan={2} className="py-6 text-center text-slate-400">暂无详细字段</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </section>
        </div>
      </div>

      {tagModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
          <div className="w-full max-w-md rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 shadow-2xl overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
              <div>
                <h3 className="text-base font-bold text-slate-900 dark:text-white">添加标签</h3>
                <p className="text-xs text-slate-500 mt-1">会与当前标签合并，不会覆盖已有标签</p>
              </div>
              <button
                onClick={() => !savingTags && setTagModalOpen(false)}
                className="text-slate-400 hover:text-slate-600"
              >
                <span className="material-symbols-outlined">close</span>
              </button>
            </div>
            <div className="p-5 space-y-3">
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">标签（支持多个）</label>
              <textarea
                rows={4}
                value={tagInput}
                onChange={(e) => setTagInput(e.target.value)}
                placeholder="示例：重点, 已联系, 服饰"
                className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-3 py-2 text-sm resize-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
              />
              <p className="text-xs text-slate-400">支持逗号、分号、换行分隔</p>
            </div>
            <div className="px-5 py-4 border-t border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50 flex justify-end gap-2">
              <button
                onClick={() => setTagModalOpen(false)}
                disabled={savingTags}
                className="px-4 py-2 rounded-lg text-sm font-semibold border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-white dark:hover:bg-slate-700 disabled:opacity-60"
              >
                取消
              </button>
              <button
                onClick={handleAddTags}
                disabled={savingTags}
                className="px-4 py-2 rounded-lg text-sm font-semibold bg-primary text-white hover:bg-primary/90 disabled:opacity-60"
              >
                {savingTags ? '保存中...' : '确认添加'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
    </div>
  );
};

export default InfluencerDetail;
