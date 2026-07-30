import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  css: {
    modules: {
      // 自定义生成的类名格式 （原类名+短哈希）
      generateScopedName: '[local]__[hash:base64:6]',
    },
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      'src': path.resolve(__dirname, './src'),
    },
  },
  server: {
    proxy: {
      '/api': {
        // 代理目标指向后端服务地址；当前后端运行在 8000 端口
        target: 'http://127.0.0.1:3601',
        changeOrigin: true,
      },
    },
  },
});
