import { FolderOpen, RotateCcw } from 'lucide-react';
import { useEffect, useState } from 'react';
import {
  chooseGeneratedFilesDirectory,
  loadGeneratedFilesSettings,
  saveGeneratedFilesDirectory,
} from '../api';
import type { GeneratedFilesSettings as GeneratedFilesSettingsValue, Locale } from '../types';
import './GeneratedFilesSettings.css';

export function GeneratedFilesSettings({
  locale,
  workspaceRoot,
}: {
  locale: Locale;
  workspaceRoot: string;
}) {
  const [settings, setSettings] = useState<GeneratedFilesSettingsValue | null>(null);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let active = true;
    void loadGeneratedFilesSettings(workspaceRoot)
      .then((value) => {
        if (active) setSettings(value);
      })
      .catch((reason) => {
        if (active) setError(String(reason));
      });
    return () => {
      active = false;
    };
  }, [workspaceRoot]);

  const chooseDirectory = async () => {
    setError('');
    try {
      const directory = await chooseGeneratedFilesDirectory(settings?.directory);
      if (!directory) return;
      setSaving(true);
      setSettings(await saveGeneratedFilesDirectory(directory, workspaceRoot));
    } catch (reason) {
      setError(String(reason));
    } finally {
      setSaving(false);
    }
  };

  const restoreWorkspace = async () => {
    setError('');
    setSaving(true);
    try {
      setSettings(await saveGeneratedFilesDirectory(null, workspaceRoot));
    } catch (reason) {
      setError(String(reason));
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className="settings-preference-block generated-files-settings">
      <div className="settings-section-heading">
        <h2>{locale === 'zh' ? '默认生成保存位置' : 'Default generated-file location'}</h2>
        <p>
          {locale === 'zh'
            ? 'PPT、DOCX、PDF 和视频会保存到这里；未自定义时跟随当前工作区。'
            : 'Presentations, DOCX, PDF, and video files are saved here. The current workspace is used by default.'}
        </p>
      </div>
      <div className="generated-files-location">
        <div className="generated-files-path" aria-live="polite">
          <span>{locale === 'zh' ? '当前路径' : 'Current path'}</span>
          <strong>{settings?.directory || (locale === 'zh' ? '正在读取…' : 'Loading…')}</strong>
          {settings?.usesWorkspaceDefault && (
            <small>{locale === 'zh' ? '当前工作区（默认）' : 'Current workspace (default)'}</small>
          )}
        </div>
        <div className="generated-files-actions">
          <button type="button" onClick={() => void chooseDirectory()} disabled={saving}>
            <FolderOpen size={16} strokeWidth={1.8} />
            {locale === 'zh' ? '选择文件夹' : 'Choose folder'}
          </button>
          {settings && !settings.usesWorkspaceDefault && (
            <button type="button" onClick={() => void restoreWorkspace()} disabled={saving}>
              <RotateCcw size={15} strokeWidth={1.8} />
              {locale === 'zh' ? '跟随当前工作区' : 'Use current workspace'}
            </button>
          )}
        </div>
      </div>
      {error && <p className="generated-files-error" role="alert">{error}</p>}
    </section>
  );
}
