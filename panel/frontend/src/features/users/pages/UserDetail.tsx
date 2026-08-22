import React, { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { getPublicProfile } from '@/features/account/api/profile';
import type { Profile } from '@/shared/types/user';
import GlassCard from '@/shared/components/ui/Card';
import Avatar from '@/shared/components/ui/Avatar';
import GlassModal from '@/shared/components/ui/Modal';
import CardMenu from '@/shared/components/ui/CardMenu/CardMenu';
import { useSettingsStore } from '@/shared/stores/settingsStore';

const UserDetail: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    const load = async () => {
      if (!id) return;
      setLoading(true);
      setError('');
      try {
        const data = await getPublicProfile(Number(id));
        setProfile(data);
      } catch (e: any) {
        setError(e?.response?.data || 'Failed to load user profile');
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [id]);

  const back = () => navigate('/users');

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full text-gray-400">Loading…</div>
    );
  }

  if (error) {
    return <p className="text-red-400">{error}</p>;
  }

  if (!profile) {
    return <p className="text-gray-400">User not found</p>;
  }

  const avatarUrl = profile.avatar_url;
  const bannerUrl = profile.banner_url;

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-4">
        <button onClick={back} className="ks-btn-header ks-icon-btn" aria-label="Back to Users list">
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-5 h-5"><polyline points="15 18 9 12 15 6"/></svg>
        </button>
        <h2 className="text-xl font-semibold text-white">User Detail</h2>
      </div>
      <GlassCard className="relative overflow-hidden rounded-xl">
        {bannerUrl && (
          <img src={bannerUrl} alt="banner" className="w-full h-32 object-cover" />
        )}
        <div className="absolute -bottom-5 left-4">
          <div className="rounded-full ring-2 ring-black/40 bg-black/40">
            <Avatar
              name={profile.username}
              size={64}
              accentColor={profile.accent_color || '#4b5563'}
              symbol={profile.avatar_symbol}
              imageUrl={avatarUrl}
            />
          </div>
        </div>
        <div className="pt-20 px-4 pb-4">
          <h3 className="text-lg font-semibold text-white">{profile.display_name || profile.username}</h3>
          <p className="text-sm text-gray-400">@{profile.username}</p>
          {profile.pronouns && <p className="text-sm text-gray-300">Pronouns: {profile.pronouns}</p>}
          {profile.bio && <p className="mt-2 text-gray-200">{profile.bio}</p>}
          <div className="mt-4 flex flex-wrap gap-2">
            <span className="inline-flex items-center gap-1.5 text-[10px] uppercase tracking-wide px-2 py-0.5 rounded-md border bg-sky-900/50 border-sky-700/40 text-sky-300">
              {profile.email}
            </span>
          </div>
          {profile.accent_color && (
            <div className="mt-4 h-2 rounded-full bg-[profile.accent_color] w-full" />
          )}
          {profile.social_links && profile.social_links.length > 0 && (
            <div className="mt-4">
              <h4 className="text-sm font-medium text-gray-300 mb-2">Social Links</h4>
              <ul className="space-y-1">
                {profile.social_links.map((link, i) => (
                  <li key={i}>
                    <a href={link.url} target="_blank" rel="noreferrer" className="text-sm text-blue-400 hover:underline">
                      {link.label || link.type}
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          )}
          {profile.avatar_url && (
            <div className="mt-4">
              <img src={profile.avatar_url} alt="avatar" className="w-24 h-24 object-cover rounded-full" />
            </div>
          )}
          {profile.banner_url && (
            <div className="mt-2 h-16 w-full rounded-md overflow-hidden bg-gray-200">
              <img src={profile.banner_url} alt="banner" className="w-full h-full object-cover" />
            </div>
          )}
          <div className="mt-4 text-sm text-gray-400">
            <strong>ID:</strong> {profile.id}
            <br />
            <strong>Role ID:</strong> {profile.role_id}
            <br />
            <strong>Created:</strong> {new Date(profile.created_at).toLocaleDateString()}
          </div>
        </div>
      </GlassCard>
    </div>
  );
};

export default UserDetail;
