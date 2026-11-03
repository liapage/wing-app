import React, { createContext, useContext, useMemo, useState } from 'react';
import { useColorScheme } from 'react-native';
import { lightTheme, darkTheme, Theme } from './themes';

type Mode = 'system' | 'light' | 'dark';

type Ctx = { theme: Theme; mode: Mode; setMode: (m: Mode) => void; isDark: boolean };

const ThemeContext = createContext<Ctx | null>(null);

export function ThemeProvider({ children }: { children: React.ReactNode }) {
    const system = useColorScheme(); // 'light' | 'dark' | null
    const [mode, setMode] = useState<Mode>('system');

    const isDark = (mode === 'system' ? system : mode) === 'dark';
    const theme = isDark ? darkTheme : lightTheme;

    const value = useMemo(() => ({ theme, mode, setMode, isDark }), [theme, mode, isDark]);
    return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export const useTheme = () => {
    const ctx = useContext(ThemeContext);
    if (!ctx) throw new Error('useTheme must be used inside ThemeProvider');
    return ctx;
};