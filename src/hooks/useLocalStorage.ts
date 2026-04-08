import { useState, useEffect } from 'react';
import { DebateConfig, DebateInfo, DEFAULT_CONFIG, DEFAULT_DEBATE_INFO } from '../types';

const CONFIG_KEY = 'debate-chess-clock-config';
const DEBATE_INFO_KEY = 'debate-chess-clock-info';

/**
 * 使用 localStorage 保存和读取配置
 */
export function useLocalStorage<T>(
  key: string,
  initialValue: T
): [T, (value: T | ((val: T) => T)) => void] {
  const [storedValue, setStoredValue] = useState<T>(() => {
    try {
      const item = window.localStorage.getItem(key);
      return item ? JSON.parse(item) : initialValue;
    } catch (error) {
      console.error(`Error reading localStorage key "${key}":`, error);
      return initialValue;
    }
  });

  const setValue = (value: T | ((val: T) => T)) => {
    try {
      const valueToStore = value instanceof Function ? value(storedValue) : value;
      setStoredValue(valueToStore);
      window.localStorage.setItem(key, JSON.stringify(valueToStore));
    } catch (error) {
      console.error(`Error setting localStorage key "${key}":`, error);
    }
  };

  return [storedValue, setValue];
}

/**
 * 保存辩论配置
 */
export function useDebateConfig() {
  return useLocalStorage<DebateConfig>(CONFIG_KEY, DEFAULT_CONFIG);
}

/**
 * 保存辩论信息
 */
export function useDebateInfo() {
  return useLocalStorage<DebateInfo>(DEBATE_INFO_KEY, DEFAULT_DEBATE_INFO);
}
