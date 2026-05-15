import { defineConfig } from 'wxt';

// See https://wxt.dev/api/config.html
export default defineConfig({
  modules: ['@wxt-dev/module-react'],
  manifest: {
    name: 'YouTube Watch Later Cleaner',
    short_name: 'Watch Later Cleaner',
    description: 'Safely remove videos from your YouTube Watch Later playlist.',
    version: '2.0.0',
    permissions: ['activeTab', 'scripting'],
    host_permissions: ['https://www.youtube.com/*'],
    action: {},
    icons: {
      '16': '/icon16.png',
      '48': '/icon48.png',
      '128': '/icon128.png'
    }
  }
});
