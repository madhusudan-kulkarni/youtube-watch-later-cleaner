import { defineConfig } from 'wxt';

export default defineConfig({

  manifest: ({ browser }) => ({
    name: 'YouTube Watch Later Cleaner',
    short_name: 'Watch Later Cleaner',
    description: 'Safely remove videos from your YouTube Watch Later playlist.',
    version: '2.1.0',
    ...(browser === 'chrome' && { minimum_chrome_version: '102' }),
    homepage_url: 'https://github.com/madhusudan-kulkarni/youtube-watch-later-cleaner',
    permissions: ['activeTab', 'scripting', 'storage'],
    host_permissions: ['https://www.youtube.com/*'],
    action: {},
    icons: {
      '16': '/icon16.png',
      '48': '/icon48.png',
      '128': '/icon128.png'
    },
    ...(browser === 'firefox' && {
      browser_specific_settings: {
        gecko: {
          id: 'watch-later-cleaner@madhusudan.dev',
          strict_min_version: '115.0',
          data_collection_permissions: {
            required: ['none']
          }
        }
      }
    })
  })
});
