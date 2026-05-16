import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Linking,
  Platform,
  ScrollView,
  Text,
  TextInput,
  View,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useQueryClient } from '@tanstack/react-query';
import Ionicons from '@expo/vector-icons/Ionicons';
import { AppLogo } from '@/components/AppLogo';
import { useResponsive } from '@/hooks/useResponsive';
import { useSettingsStore } from '@/store/settingsStore';
import { useAppTheme } from '@/theme/AppThemeProvider';
import { TMDB_API_BASE, TMDB_ENV_API_KEY, CINEPRO_ENV_BASE_URL } from '@/utils/env';
import { FocusSurface } from '@/tv/FocusSurface';

const ECOSYSTEM_FEATURES = [
  {
    icon: 'server-outline' as const,
    title: 'Multi-source scraper',
    body: 'OMSS-compliant core engine that resolves many unique sources per movie or show.',
  },
  {
    icon: 'tv-outline' as const,
    title: 'Modern experience',
    body: 'Browse, watch, and discover — built for self-hosting and homelabs you control.',
  },
  {
    icon: 'git-branch-outline' as const,
    title: 'Open ecosystem',
    body: 'Core, UI, and docs under cinepro-org — plug in your own stack and frontend.',
  },
] as const;

const LINKS = {
  site: 'https://cinepro.cc/',
  docs: 'https://docs.cinepro.cc/',
  github: 'https://github.com/cinepro-org',
  ui: 'https://ui.cinepro.cc/',
} as const;

function looksLikeHttpUrl(s: string): boolean {
  return /^https?:\/\/.+/i.test(s.trim());
}

export function OnboardingScreen() {
  const insets = useSafeAreaInsets();
  const { sectionGap } = useResponsive();
  const { colors, isDark } = useAppTheme();
  const queryClient = useQueryClient();
  const draftTmdb = useSettingsStore((s) => s.tmdbApiKey);
  const draftUrl = useSettingsStore((s) => s.cineproBaseUrl);
  const completeOnboarding = useSettingsStore((s) => s.completeOnboarding);

  const [step, setStep] = useState(0);
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

  const openLink = (url: string) => {
    void Linking.openURL(url);
  };

  return (
    <KeyboardAvoidingView
      className="flex-1"
      style={{ backgroundColor: colors.ink }}
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
        <View className="items-center mb-6">
          <AppLogo width={168} height={44} />
        </View>

        {step === 0 ? (
          <>
            <LinearGradient
              colors={isDark ? ['#161929', '#0f111a'] : ['#ffffff', '#eef0f8']}
              style={{
                borderRadius: 22,
                padding: 22,
                marginBottom: 20,
                borderWidth: 1,
                borderColor: colors.borderStrong,
              }}
            >
              <Text
                className="text-[11px] font-bold tracking-[0.28em] mb-2 uppercase"
                style={{ color: colors.textFaint }}
              >
                CinePro ecosystem
              </Text>
              <Text className="text-[22px] font-extrabold leading-8" style={{ color: colors.text }}>
                Your open-source HTTP streaming stack
              </Text>
              <Text className="text-sm mt-3 leading-6" style={{ color: colors.textMuted }}>
                CinePro is an open-source ecosystem for building your own movie & TV experience: OMSS-compliant
                core engine, modern UI, and living documentation — designed for self-hosting and homelabs.
              </Text>
            </LinearGradient>

            <View className="gap-3 mb-6">
              {ECOSYSTEM_FEATURES.map((f) => (
                <View
                  key={f.title}
                  className="rounded-2xl p-4 flex-row gap-3 border"
                  style={{ backgroundColor: colors.card, borderColor: colors.border }}
                >
                  <View
                    className="w-10 h-10 rounded-xl items-center justify-center border"
                    style={{ backgroundColor: colors.inputBg, borderColor: colors.border }}
                  >
                    <Ionicons name={f.icon} color={colors.accent} size={20} />
                  </View>
                  <View className="flex-1">
                    <Text className="font-bold text-[15px]" style={{ color: colors.text }}>
                      {f.title}
                    </Text>
                    <Text className="text-[13px] mt-1 leading-5" style={{ color: colors.textMuted }}>
                      {f.body}
                    </Text>
                  </View>
                </View>
              ))}
            </View>

            <View className="flex-row flex-wrap gap-2 mb-8">
              {(
                [
                  ['Website', LINKS.site],
                  ['Docs', LINKS.docs],
                  ['GitHub', LINKS.github],
                ] as const
              ).map(([label, url]) => (
                <FocusSurface
                  key={url}
                  className="rounded-full px-4 py-2.5 border flex-row items-center gap-1.5"
                  style={{ borderColor: colors.borderStrong, backgroundColor: colors.inputBg }}
                  onPress={() => openLink(url)}
                >
                  <Ionicons name="open-outline" size={14} color={colors.accent} />
                  <Text className="font-semibold text-[13px]" style={{ color: colors.text }}>
                    {label}
                  </Text>
                </FocusSurface>
              ))}
            </View>

            <FocusSurface
              className="rounded-2xl py-4 items-center justify-center"
              style={{ backgroundColor: colors.accent }}
              onPress={() => setStep(1)}
              accessibilityLabel="Continue to setup"
            >
              <Text className="font-bold text-base" style={{ color: colors.textOnAccent }}>
                Connect your services
              </Text>
            </FocusSurface>
          </>
        ) : (
          <>
            <View
              className="rounded-2xl p-5 mb-5 border"
              style={{ backgroundColor: colors.card, borderColor: colors.border }}
            >
              <Text className="text-[11px] font-bold tracking-[0.22em] uppercase mb-2" style={{ color: colors.textFaint }}>
                Setup
              </Text>
              <Text className="text-xl font-bold" style={{ color: colors.text }}>
                Connect TMDB & Core
              </Text>
              <Text className="text-sm mt-2 leading-5" style={{ color: colors.textMuted }}>
                This app uses TMDB for posters and metadata, and your self-hosted CinePro Core (OMSS) for streams.
                Nothing is bundled — you stay in control.
              </Text>
            </View>

            <Text className="text-xs mb-2" style={{ color: colors.textMuted }}>
              TMDB API key
            </Text>
            <TextInput
              value={tmdbKey}
              onChangeText={(t) => {
                setTmdbKey(t);
                setError(null);
              }}
              placeholder="Paste API v3 key from themoviedb.org"
              placeholderTextColor={isDark ? 'rgba(255,255,255,0.35)' : 'rgba(11,12,18,0.35)'}
              autoCapitalize="none"
              autoCorrect={false}
              secureTextEntry
              className="rounded-2xl border px-4 py-3 mb-1"
              style={{
                backgroundColor: colors.inputBg,
                borderColor: colors.border,
                color: colors.text,
              }}
              accessibilityLabel="TMDB API key"
            />
            <Text className="text-[11px] mb-5 leading-4" style={{ color: colors.textFaint }}>
              Stored on this device only. Create a key under TMDB Settings → API.
            </Text>

            <Text className="text-xs mb-2" style={{ color: colors.textMuted }}>
              CinePro Core URL (OMSS)
            </Text>
            <TextInput
              value={coreUrl}
              onChangeText={(t) => {
                setCoreUrl(t);
                setError(null);
              }}
              placeholder={CINEPRO_ENV_BASE_URL || 'https://your-core.example.com'}
              placeholderTextColor={isDark ? 'rgba(255,255,255,0.35)' : 'rgba(11,12,18,0.35)'}
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="url"
              className="rounded-2xl border px-4 py-3 mb-5"
              style={{
                backgroundColor: colors.inputBg,
                borderColor: colors.border,
                color: colors.text,
              }}
              accessibilityLabel="CinePro Core base URL"
            />

            {error ? (
              <Text className="text-red-500 text-sm mb-4 leading-5" accessibilityLiveRegion="polite">
                {error}
              </Text>
            ) : null}

            <View className="flex-row gap-3">
              <FocusSurface
                className="flex-1 rounded-2xl py-4 items-center justify-center border"
                style={{ borderColor: colors.borderStrong, backgroundColor: colors.inputBg }}
                onPress={() => setStep(0)}
                accessibilityLabel="Back"
              >
                <Text className="font-bold text-base" style={{ color: colors.text }}>
                  Back
                </Text>
              </FocusSurface>
              <FocusSurface
                className={`flex-[1.4] rounded-2xl py-4 items-center justify-center flex-row gap-2 ${busy ? 'opacity-70' : ''}`}
                style={{ backgroundColor: colors.accent }}
                onPress={() => void onContinue()}
                accessibilityLabel="Finish setup"
                disabled={busy}
              >
                {busy ? <ActivityIndicator color={colors.textOnAccent} /> : null}
                <Text className="font-bold text-base" style={{ color: colors.textOnAccent }}>
                  {busy ? 'Checking…' : 'Get started'}
                </Text>
              </FocusSurface>
            </View>

            <Text className="text-xs mt-6 leading-5 text-center" style={{ color: colors.textFaint }}>
              Change these anytime in Settings. Learn more at cinepro.cc
            </Text>
          </>
        )}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
