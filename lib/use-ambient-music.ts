"use client";

import { useCallback, useEffect, useRef, useSyncExternalStore } from "react";
import { AmbientMusic } from "./ambient-music";
import type { MusicScene } from "./music-scene";

/**
 * 音乐生命周期：
 * - 不在挂载时自动播放（浏览器会拦截），由开始/继续/选择等用户手势触发 start；
 * - 场景变化只更新下一组和弦，不打断当前氛围；
 * - 关闭时淡出，卸载时释放 AudioContext。
 */
function subscribeSupport(): () => void {
  return () => {};
}

function getSupportSnapshot(): boolean {
  return AmbientMusic.isSupported();
}

function getServerSupportSnapshot(): boolean {
  return false;
}

export function useAmbientMusic(scene: MusicScene) {
  const engineRef = useRef<AmbientMusic | null>(null);
  const startedRef = useRef(false);
  const sceneRef = useRef(scene);
  const supported = useSyncExternalStore(subscribeSupport, getSupportSnapshot, getServerSupportSnapshot);

  const start = useCallback(() => {
    if (!AmbientMusic.isSupported()) return;
    if (!engineRef.current) engineRef.current = new AmbientMusic();
    startedRef.current = true;
    void engineRef.current.start(sceneRef.current).catch(() => {
      // 自动播放被拒绝或音频设备不可用时不打断游戏；玩家可再次点击音乐开关。
      startedRef.current = false;
    });
  }, []);

  const stop = useCallback(() => {
    startedRef.current = false;
    engineRef.current?.stop();
  }, []);

  useEffect(() => {
    sceneRef.current = scene;
    if (startedRef.current) engineRef.current?.setScene(scene);
  }, [scene]);

  useEffect(() => {
    return () => {
      engineRef.current?.dispose();
      engineRef.current = null;
      startedRef.current = false;
    };
  }, []);

  return { start, stop, supported };
}
