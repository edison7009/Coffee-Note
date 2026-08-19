import { Check, Copy, LoaderCircle, MessageCircleMore, Unplug, X } from 'lucide-react';
import QRCode from 'qrcode';
import { writeText } from '@tauri-apps/plugin-clipboard-manager';
import { useCallback, useEffect, useState } from 'react';
import {
  connectTelegram,
  disconnectTelegram,
  disconnectWeixin,
  getMessageChannelStatus,
  listenMessageChannelStatus,
  loadMessageSettings,
  pollWeixinLogin,
  startWeixinLogin,
  updateMessageTranscriptionMode,
} from '../api';
import { translate } from '../i18n';
import type {
  Locale,
  MessageChannelStatus,
  MessageSettingsConfig,
  WeixinLoginPoll,
} from '../types';

const EMPTY_STATUS: MessageChannelStatus = {
  weixin: 'disconnected',
  telegram: 'disconnected',
  weixinError: '',
  telegramError: '',
  activeJobs: 0,
};

export function MessageSettings({ locale }: { locale: Locale }) {
  const [settings, setSettings] = useState<MessageSettingsConfig | null>(null);
  const [status, setStatus] = useState(EMPTY_STATUS);
  const [telegramToken, setTelegramToken] = useState('');
  const [weixinSessionId, setWeixinSessionId] = useState('');
  const [weixinQr, setWeixinQr] = useState('');
  const [weixinPoll, setWeixinPoll] = useState<WeixinLoginPoll | null>(null);
  const [verifyCode, setVerifyCode] = useState('');
  const [busy, setBusy] = useState<'weixin' | 'telegram' | ''>('');
  const [error, setError] = useState('');
  const [copied, setCopied] = useState(false);

  const refresh = useCallback(async () => {
    const [nextSettings, nextStatus] = await Promise.all([
      loadMessageSettings(),
      getMessageChannelStatus(),
    ]);
    setSettings(nextSettings);
    setStatus(nextStatus);
  }, []);

  useEffect(() => {
    void refresh().catch((reason) => setError(String(reason)));
    let unlisten = () => {};
    void listenMessageChannelStatus(() => void refresh()).then((stop) => {
      unlisten = stop;
    });
    return () => unlisten();
  }, [refresh]);

  useEffect(() => {
    if (!weixinSessionId || weixinPoll?.connected || weixinPoll?.needsVerifyCode) return undefined;
    let stopped = false;
    let timer = 0;
    const poll = async () => {
      try {
        const result = await pollWeixinLogin(weixinSessionId);
        if (stopped) return;
        setWeixinPoll(result);
        if (result.connected) {
          setWeixinQr('');
          setWeixinSessionId('');
          await refresh();
          return;
        }
      } catch (reason) {
        if (!stopped) setError(String(reason));
      }
      if (!stopped) timer = window.setTimeout(() => void poll(), 1200);
    };
    void poll();
    return () => {
      stopped = true;
      window.clearTimeout(timer);
    };
  }, [refresh, weixinPoll?.connected, weixinSessionId]);

  const connectWeixin = async () => {
    setBusy('weixin');
    setError('');
    try {
      const login = await startWeixinLogin();
      const dataUrl = await QRCode.toDataURL(login.qrCodeUrl, {
        width: 224,
        margin: 1,
        color: { dark: '#111111', light: '#ffffff' },
      });
      setWeixinSessionId(login.sessionId);
      setWeixinQr(dataUrl);
      setWeixinPoll(null);
    } catch (reason) {
      setError(String(reason));
    } finally {
      setBusy('');
    }
  };

  const submitVerifyCode = async () => {
    if (!weixinSessionId || !verifyCode.trim()) return;
    setBusy('weixin');
    try {
      const result = await pollWeixinLogin(weixinSessionId, verifyCode.trim());
      setWeixinPoll(result);
      setVerifyCode('');
    } catch (reason) {
      setError(String(reason));
    } finally {
      setBusy('');
    }
  };

  const connectTelegramBot = async () => {
    if (!telegramToken.trim()) return;
    setBusy('telegram');
    setError('');
    try {
      const next = await connectTelegram(telegramToken.trim());
      setSettings(next);
      setTelegramToken('');
      await refresh();
    } catch (reason) {
      setError(String(reason));
    } finally {
      setBusy('');
    }
  };

  const statusText = (value: string) => {
    if (locale === 'en') {
      return ({ connected: 'Connected', connecting: 'Connecting', waiting_scan: 'Scan to connect', waiting_pairing: 'Waiting for pairing', error: 'Connection error' } as Record<string, string>)[value] || 'Not connected';
    }
    return ({ connected: '已连接', connecting: '正在连接', waiting_scan: '等待扫码', waiting_pairing: '等待手机配对', error: '连接异常' } as Record<string, string>)[value] || '尚未连接';
  };

  const pairingCode = settings?.telegram.pairingCode || '';
  const connectedCount = Number(status.weixin === 'connected') + Number(status.telegram === 'connected');
  const speechModeLabel = translate(locale, 'captureTranscriptionPrefix').replace(/[：:\s]+$/, '');

  const selectTranscriptionMode = async (transcriptionMode: 'api' | 'local') => {
    const previousMode = settings?.transcriptionMode || 'api';
    setError('');
    setSettings((current) => current ? { ...current, transcriptionMode } : current);
    try {
      await updateMessageTranscriptionMode(transcriptionMode);
      await refresh();
    } catch (reason) {
      setSettings((current) => current ? { ...current, transcriptionMode: previousMode } : current);
      setError(String(reason));
    }
  };

  return (
    <div className="message-settings">
      <div className="settings-section-heading message-settings-heading">
        <h2>{locale === 'zh' ? '消息渠道' : 'Message channels'}</h2>
        <p>
          {locale === 'zh'
            ? '连接后可像在客户端一样与 TierNote 对话；AI 会按你的意图回答、读取或整理本地笔记，单独发送链接也可以转成文档。手机对话会同步到客户端的对话记录。'
            : 'Chat with TierNote from your phone just like in the desktop app. AI can answer, use local notes, or turn a shared link into a document, and the conversation appears in desktop history.'}
        </p>
        <span className="message-settings-summary">
          {connectedCount > 0
            ? `${connectedCount} ${locale === 'zh' ? '个渠道已连接' : connectedCount === 1 ? 'channel connected' : 'channels connected'}`
            : locale === 'zh' ? '尚未连接渠道' : 'No channels connected'}
          {status.activeJobs > 0 ? ` · ${status.activeJobs} ${locale === 'zh' ? '个任务处理中' : 'job in progress'}` : ''}
        </span>
      </div>

      {error && <div className="message-settings-error">{error.replace(/^Error:\s*/i, '')}</div>}

      <section className="message-channel-row">
        <div className="message-channel-mark">
          <img src="/channels/weixin.png" alt="" aria-hidden="true" />
        </div>
        <div className="message-channel-copy">
          <div className="message-channel-title">
            <strong>{locale === 'zh' ? '微信' : 'Weixin'}</strong>
            <span className={`message-channel-state state-${status.weixin}`}>
              {status.weixin === 'connected' ? <Check size={13} /> : status.weixin === 'error' ? <X size={13} /> : null}
              {statusText(status.weixin)}
            </span>
          </div>
          <p>{locale === 'zh' ? '使用腾讯官方 iLink 服务，扫码后即可通过机器人私聊对话。' : 'Uses Tencent iLink. Scan once, then chat privately with the bot.'}</p>
          {status.weixinError && <small>{status.weixinError}</small>}
          {weixinQr && (
            <div className="weixin-connect-flow">
              <img src={weixinQr} alt={locale === 'zh' ? '微信连接二维码' : 'Weixin connection QR code'} />
              <div>
                <strong>{weixinPoll?.message || (locale === 'zh' ? '使用手机微信扫码' : 'Scan with Weixin')}</strong>
                <p>{locale === 'zh' ? '扫码后根据手机提示确认。二维码只用于本次连接。' : 'Confirm on your phone after scanning. This QR code is only for this connection.'}</p>
                {weixinPoll?.needsVerifyCode && (
                  <div className="message-inline-form">
                    <input
                      inputMode="numeric"
                      value={verifyCode}
                      onChange={(event) => setVerifyCode(event.target.value.replace(/\D/g, '').slice(0, 8))}
                      placeholder={locale === 'zh' ? '输入手机显示的数字' : 'Enter the number shown on your phone'}
                    />
                    <button type="button" onClick={() => void submitVerifyCode()} disabled={!verifyCode || busy === 'weixin'}>
                      {locale === 'zh' ? '确认' : 'Confirm'}
                    </button>
                  </div>
                )}
              </div>
            </div>
          )}
          {!settings?.weixin.enabled && !weixinQr && (
            <small className="weixin-terms-note">
              {locale === 'zh'
                ? '点击连接并扫码，即表示你同意手机微信连接时展示的微信 ClawBot 功能使用条款。'
                : 'Connecting and scanning means you accept the Weixin ClawBot terms shown in the mobile confirmation flow.'}
            </small>
          )}
        </div>
        <div className="message-channel-action">
          {settings?.weixin.enabled ? (
            <button type="button" className="message-disconnect" onClick={() => void disconnectWeixin().then(refresh)}>
              <Unplug size={15} />{locale === 'zh' ? '断开' : 'Disconnect'}
            </button>
          ) : (
            <button type="button" onClick={() => void connectWeixin()} disabled={busy === 'weixin'}>
              {busy === 'weixin' ? <LoaderCircle className="spin" size={15} /> : <MessageCircleMore size={15} />}
              {locale === 'zh' ? '连接微信' : 'Connect Weixin'}
            </button>
          )}
        </div>
      </section>

      <section className="message-channel-row">
        <div className="message-channel-mark">
          <img src="/channels/telegram.png" alt="" aria-hidden="true" />
        </div>
        <div className="message-channel-copy">
          <div className="message-channel-title">
            <strong>Telegram</strong>
            <span className={`message-channel-state state-${status.telegram}`}>
              {status.telegram === 'connected' ? <Check size={13} /> : status.telegram === 'error' ? <X size={13} /> : null}
              {statusText(status.telegram)}
            </span>
          </div>
          <p>{locale === 'zh' ? '在 BotFather 创建机器人，粘贴 Token 后用一次性配对码绑定你的账号。' : 'Create a bot with BotFather, paste its token, then bind your account using a one-time pairing code.'}</p>
          {status.telegramError && <small>{status.telegramError}</small>}
          {!settings?.telegram.enabled && (
            <div className="message-inline-form telegram-token-form">
              <input
                type="password"
                value={telegramToken}
                onChange={(event) => setTelegramToken(event.target.value)}
                placeholder={locale === 'zh' ? '粘贴 BotFather 提供的 Token' : 'Paste the token from BotFather'}
                autoComplete="off"
              />
              <button type="button" onClick={() => void connectTelegramBot()} disabled={!telegramToken.trim() || busy === 'telegram'}>
                {busy === 'telegram' ? <LoaderCircle className="spin" size={15} /> : null}
                {locale === 'zh' ? '连接' : 'Connect'}
              </button>
            </div>
          )}
          {settings?.telegram.enabled && pairingCode && (
            <div className="telegram-pairing">
              <span>{locale === 'zh' ? `在 @${settings.telegram.botName} 发送` : `Send this to @${settings.telegram.botName}`}</span>
              <button
                type="button"
                onClick={() => {
                  void writeText(`/pair ${pairingCode}`);
                  setCopied(true);
                  window.setTimeout(() => setCopied(false), 1400);
                }}
              >
                <code>/pair {pairingCode}</code>
                {copied ? <Check size={14} /> : <Copy size={14} />}
              </button>
            </div>
          )}
        </div>
        <div className="message-channel-action">
          {settings?.telegram.enabled && (
            <button type="button" className="message-disconnect" onClick={() => void disconnectTelegram().then(refresh)}>
              <Unplug size={15} />{locale === 'zh' ? '断开' : 'Disconnect'}
            </button>
          )}
        </div>
      </section>

      <section className="message-processing-mode">
        <div>
          <strong>{speechModeLabel}</strong>
          <p>{locale === 'zh' ? '两个消息渠道共用此默认方式，具体服务在“音频转文案”设置中配置。' : 'Both channels use this default. Configure the service under Audio to text.'}</p>
        </div>
        <div className="message-mode-switch">
          <button
            type="button"
            className={settings?.transcriptionMode !== 'local' ? 'active' : ''}
            aria-pressed={settings?.transcriptionMode !== 'local'}
            onClick={() => void selectTranscriptionMode('api')}
          >
            {translate(locale, 'captureTranscriptionApi')}
          </button>
          <button
            type="button"
            className={settings?.transcriptionMode === 'local' ? 'active' : ''}
            aria-pressed={settings?.transcriptionMode === 'local'}
            onClick={() => void selectTranscriptionMode('local')}
          >
            {translate(locale, 'captureTranscriptionLocal')}
          </button>
        </div>
      </section>

      <p className="message-settings-footnote">
        {locale === 'zh'
          ? '仅接受已绑定账号的私聊。手机端使用与客户端相同的 AI 工作区能力，因此可以按你的要求读取、创建或修改当前工作区中的代码、文档和笔记；它不能执行终端命令或修改应用设置。电脑需保持开机，TierNote 可在后台运行。'
          : 'Only direct messages from the paired account are accepted. Phone chats use the same AI workspace capabilities as the desktop app, so they can read, create, or edit code, documents, and notes in the current workspace when asked; they cannot run terminal commands or change app settings. Keep this computer on with TierNote running in the background.'}
      </p>
    </div>
  );
}
