/**
 * 将秒数格式化为 MM:SS 格式
 */
export function formatTime(seconds: number): string {
  const totalSeconds = Math.max(0, Math.floor(seconds));
  const minutes = Math.floor(totalSeconds / 60);
  const remainingSeconds = totalSeconds % 60;
  return `${String(minutes).padStart(2, '0')}:${String(remainingSeconds).padStart(2, '0')}`;
}

/**
 * 将分钟数转换为秒数
 */
export function minutesToSeconds(minutes: number): number {
  return minutes * 60;
}

/**
 * 将秒数转换为分钟数
 */
export function secondsToMinutes(seconds: number): number {
  return seconds / 60;
}

/**
 * 获取时间警告级别
 */
export function getTimeWarningLevel(seconds: number): 'normal' | 'warning' | 'danger' | 'expired' {
  if (seconds <= 0) {
    return 'expired';
  }
  if (seconds < 60) {
    return 'danger'; // 1分钟以内：红色
  }
  if (seconds < 180) {
    return 'warning'; // 3分钟以内：黄色
  }
  return 'normal'; // 正常
}
