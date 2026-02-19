export enum AppRoute {
    LOGIN = 'login',
    DASHBOARD = 'dashboard',
    INFLUENCERS = 'influencers',
    DETAILS = 'details',
    MARKETING = 'marketing',
    API_KEYS = 'api-keys',
    SUB_ACCOUNTS = 'sub-accounts',
    SETTINGS = 'settings'
}

export interface Influencer {
    id: string;
    name: string;
    handle: string;
    avatar: string;
    platform: 'Instagram' | 'TikTok' | 'YouTube';
    followers: string;
    location: string;
    email: string;
    shareLink?: string;
    status: 'synced' | 'pending' | 'sent' | 'replied' | 'none';
    time?: string;
}

export interface StatCardProps {
    label: string;
    value: string | number;
    trend?: string;
    trendType?: 'up' | 'down';
    icon: string;
    colorClass: string;
}

export interface SmtpConfig {
    id: number;
    user_id: number;
    host: string;
    port: number;
    username: string;
    sender_name?: string;
    is_default: boolean;
    password?: string;
}

export interface EmailSendRequest {
    creator_ids: number[];
    subject: string;
    body: string;
    smtp_config_id?: number;
}

export interface EmailTemplate {
    id: number;
    user_id: number;
    title: string;
    subject: string;
    body: string;
    created_at: string;
    updated_at: string;
}

export interface EmailLog {
    id: number;
    sender_id: number;
    recipient_id: number;
    recipient_email?: string;
    recipient_name?: string;
    subject: string;
    body: string;
    status: string;
    replied: boolean;
    reply_content?: string;
    sent_at: string;
    replied_at?: string;
}

export interface UserResponse {
    id: number;
    username: string;
    is_master: boolean;
    api_key: string;
    email_username?: string;
}

export interface AuditLogResponse {
    id: number;
    user_id: number;
    action: string;
    target_type?: string;
    target_id?: number;
    details?: string;
    ip_address?: string;
    created_at: string;
}
