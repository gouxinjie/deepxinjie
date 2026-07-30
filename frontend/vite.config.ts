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
        // 后端因 8000 端口被系统孤儿 socket 占用（进程已不存在但内核未回收），
        // 本次临时改用 8001 启动后端；重启电脑后 8000 恢复可改回。
        target: 'http://127.0.0.1:8001',
        changeOrigin: true,
      },
    },
  },
});
