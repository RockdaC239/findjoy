/**
 * 功能开关：隐藏尚未完成、或暂不对普通访客开放的入口。
 * 把对应开关改回 true 即可恢复，实现与测试都保留着。
 */

/** 背景音乐还没做完：暂时隐藏所有音乐入口，并停用自动播放。 */
export const MUSIC_UI_ENABLED = false;

/** 模型设置入口（开始页右上角）：暂时隐藏，避免把本地模型/API Key 配置暴露给访客。 */
export const MODEL_SETTINGS_UI_ENABLED = false;
