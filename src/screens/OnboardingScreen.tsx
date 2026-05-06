import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  Text,
  TextInput,
  View,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useQueryClient } from '@tanstack/react-query';
import { useResponsive } from '@/hooks/useResponsive';
import { useSettingsStore } from '@/store/settingsStore';
import { TMDB_API_BASE, TMDB_ENV_API_KEY, CINEPRO_ENV_BASE_URL } from '@/utils/env';
import { FocusSurface } from '@/tv/FocusSurface';

function looksLikeHttpUrl(s: string): boolean {
  return /^https?:\/\/.+/i.test(s.trim());
}

export function OnboardingScreen() {
  const insets = useSafeAreaInsets();
  const { sectionGap } = useResponsive();
  const queryClient = useQueryClient();
  const draftTmdb = useSettingsStore((s) => s.tmdbApiKey);
  const draftUrl = useSettingsStore((s) => s.cineproBaseUrl);
  const completeOnboarding = useSettingsStore((s) => s.completeOnboarding);

  const [tmdbKey, setTmdbKey] = useState('');
  const [coreUrl, setCoreUrl] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setTmdbKey((k) => k || draftTmdb || TMDB_ENV_API_KEY);
    setCoreUrl((u) => u || draftUrl || CINEPRO_ENV_BASE_URL);
  }, [draftTmdb, draftUrl]);

  const onContinue = async () => {
    setError(null);
    const key = tmdbKey.trim();
    const url = coreUrl.trim();

    if (!looksLikeHttpUrl(url)) {
      setError('Enter a full OMSS URL starting with http:// or https://');
      return;
    }
    if (key.length < 16) {
      setError('Paste your TMDB API v3 key (usually about 32 characters).');
      return;
    }

    setBusy(true);
    try {
      const res = await fetch(`${TMDB_API_BASE}/configuration?api_key=${encodeURIComponent(key)}`);
      if (!res.ok) {
        setError(`TMDB returned ${res.status}. Check the key and try again.`);
        return;
      }

      completeOnboarding({ tmdbApiKey: key, cineproBaseUrl: url });
      await queryClient.invalidateQueries();
    } catch {
      setError('Could not reach TMDB. Check your network and try again.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <KeyboardAvoidingView
      className="flex-1 bg-ink"
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView
        contentContainerStyle={{
          flexGrow: 1,
          paddingTop: Math.max(insets.top, 20),
          paddingBottom: Math.max(insets.bottom, sectionGap * 4),
          paddingHorizontal: 20,
        }}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <LinearGradient colors={['#161929', '#07080d']} style={{ borderRadius: 20, padding: 22, marginBottom: 24 }}>
          <Text className="text-white/45 text-[11px] font-bold tracking-[0.28em] mb-2">WELCOME</Text>
          <Text className="text-white text-2xl font-extrabold leading-8">Connect your services</Text>
          <Text className="text-white/55 text-sm mt-3 leading-5">
            Add your TMDB key for listings and artwork, and your CinePro Core (OMSS) URL for playback. Nothing is
            bundled—you control both servers.
          </Text>
        </LinearGradient>

        <Text className="text-white/60 text-xs mb-2">TMDB API key</Text>
        <TextInput
          value={tmdbKey}
          onChangeText={(t) => {
            setTmdbKey(t);
            setError(null);
          }}
          placeholder="Paste API v3 key from themoviedb.org"
          placeholderTextColor="rgba(255,255,255,0.35)"
          autoCapitalize="none"
          autoCorrect={false}
          secureTextEntry
          className="rounded-2xl bg-white/10 border border-white/10 px-4 py-3 text-white mb-1"
          accessibilityLabel="TMDB API key"
        />
        <Text className="text-white/35 text-[11px] mb-5 leading-4">
          Stored on this device only. Create a key under TMDB Settings → API.
        </Text>

        <Text className="text-white/60 text-xs mb-2">CinePro Core URL (OMSS)</Text>
        <TextInput
          value={coreUrl}
          onChangeText={(t) => {
            setCoreUrl(t);
            setError(null);
          }}
          placeholder={CINEPRO_ENV_BASE_URL || 'https://your-core.example.com'}
          placeholderTextColor="rgba(255,255,255,0.35)"
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType="url"
          className="rounded-2xl bg-white/10 border border-white/10 px-4 py-3 text-white mb-5"
          accessibilityLabel="CinePro Core base URL"
        />

        {error ? (
          <Text className="text-red-400 text-sm mb-4 leading-5" accessibilityLiveRegion="polite">
            {error}
          </Text>
        ) : null}

        <FocusSurface
          className={`rounded-2xl bg-accent py-4 items-center justify-center flex-row gap-2 ${busy ? 'opacity-70' : ''}`}
          onPress={() => void onContinue()}
          accessibilityLabel="Continue to app"
          disabled={busy}
        >
          {busy ? <ActivityIndicator color="#fff" /> : null}
          <Text className="text-white font-bold text-base">{busy ? 'Checking TMDB…' : 'Continue'}</Text>
        </FocusSurface>

        <Text className="text-white/35 text-xs mt-6 leading-5 text-center">
          You can change these anytime in Settings.
        </Text>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
